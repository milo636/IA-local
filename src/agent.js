const actions = require("./actions");
const conversationAI = require("./conversationAI");
const logger = require("./logger");
const localAI = require("./localAI");
const memory = require("./memory");
const memoryEngine = require("./memoryEngine");
const permissions = require("./permissions");
const safety = require("./safety");
const { parseActionFromIntent, parseCommand } = require("./commandParser");

async function handleMessage(message) {
  const text = String(message || "").trim();
  memory.addMessage("user", text);

  if (text.toUpperCase() === "CONFIRMAR") {
    return executePendingAction();
  }

  cancelPendingActionIfUserContinues(text);

  const incomingSafety = safety.validateIncomingText(text);
  if (!incomingSafety.ok) {
    return respondBlocked(incomingSafety.reason, "input.blocked", buildAiMeta(null, text, false));
  }

  const memoryRequest = memoryEngine.parseMemoryRequest(text);
  if (memoryRequest) {
    return respondMemory(memoryRequest, text);
  }

  const aiResult = localAI.classifyIntent(text);
  const responseAiMeta = buildAiMeta(aiResult, text, true);
  const parsedAction = parseActionFromIntent(aiResult.intent, text);
  parsedAction.original = text;
  const conversationResult = conversationAI.respondToConversation(text, {
    history: memory.getMemory().messages
  });

  if (shouldUseConversation(text, parsedAction, conversationResult)) {
    return respondConversation(conversationResult, text, aiResult);
  }

  if (aiResult.intent === "unknown" || parsedAction.type === "unknown") {
    return respond(
      "No reconozco ese comando todavia. Escribi `ayuda` para ver las acciones disponibles.",
      {
        level: "info",
        action: "command.unknown",
        summary: "Comando no reconocido.",
        details: {
          intent: aiResult.intent,
          confidence: aiResult.confidence
        }
      },
      { aiMeta: responseAiMeta }
    );
  }

  parsedAction.ai = {
    intent: aiResult.intent,
    confidence: aiResult.confidence
  };

  const guard = guardAction(parsedAction);
  if (!guard.ok) {
    return respondBlocked(guard.reason, "action.denied", responseAiMeta);
  }

  const settings = permissions.getSettings();
  if (safety.requiresConfirmation(parsedAction, settings)) {
    const pendingAction = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      action: parsedAction,
      reason: "La accion puede mover o modificar archivos locales.",
      createdAt: new Date().toISOString()
    };

    memory.setPendingAction(pendingAction);
    logger.writeLog({
      level: "warn",
      action: "action.pending_confirmation",
      message: "Accion pendiente de confirmacion",
      details: {
        pendingId: pendingAction.id,
        type: parsedAction.type,
        reason: pendingAction.reason,
        ai: parsedAction.ai
      }
    });

    return respond(
      "Esta accion necesita confirmacion. Escribi CONFIRMAR para continuar.\nMotivo: la accion puede mover o modificar archivos locales.",
      {
        level: "warn",
        action: "action.pending_confirmation",
        summary: "Accion pendiente de confirmacion."
      },
      { skipLog: true, aiMeta: responseAiMeta }
    );
  }

  return executeAllowedAction(parsedAction);
}

function shouldUseConversation(text, parsedAction, conversationResult) {
  const exactAction = parseCommand(text);
  if (conversationResult.intent === "unknown") {
    return parsedAction.type === "unknown";
  }

  if (parsedAction.type === "unknown") {
    return true;
  }

  if (exactAction.type !== "unknown") {
    return false;
  }

  return conversationResult.confidence >= 0.46;
}

function cancelPendingActionIfUserContinues(text) {
  const pending = memory.getPendingAction();
  if (!pending) return;

  memory.clearPendingAction();
  logger.writeLog({
    level: "info",
    action: "action.pending_cancelled",
    message: "Accion pendiente cancelada por nuevo comando",
    details: {
      pendingId: pending.id,
      nextCommandLength: text.length
    }
  });
}

async function executePendingAction() {
  const pending = memory.getPendingAction();

  if (!pending?.action) {
    return respond(
      "No hay ninguna accion pendiente para confirmar.",
      {
        level: "info",
        action: "action.confirm.empty",
        summary: "Confirmacion sin accion pendiente."
      },
      { aiMeta: buildAiMeta(null, null, false) }
    );
  }

  const guard = guardAction(pending.action);
  if (!guard.ok) {
    memory.clearPendingAction();
    return respondBlocked(
      `La accion pendiente ya no es valida: ${guard.reason}`,
      "action.pending.denied",
      buildAiMeta(null, null, false)
    );
  }

  memory.clearPendingAction();
  return executeAllowedAction(pending.action, { confirmed: true, pendingId: pending.id });
}

async function executeAllowedAction(action, meta = {}) {
  const responseAiMeta = buildAiMeta(action.ai, action.original, Boolean(action.ai));

  try {
    const result = await actions.executeAction(action);
    logger.writeLog({
      level: "info",
      action: `action.${action.type}`,
      message: result.summary || "Accion ejecutada",
      details: sanitizeLogDetails({
        ...result.details,
        ai: action.ai || null,
        confirmed: Boolean(meta.confirmed),
        pendingId: meta.pendingId || null
      })
    });
    return respond(
      result.message,
      {
        level: "info",
        action: `action.${action.type}`,
        summary: result.summary || "Accion ejecutada."
      },
      { skipLog: true, aiMeta: responseAiMeta }
    );
  } catch (error) {
    logger.writeLog({
      level: "error",
      action: `action.${action.type}.failed`,
      message: "La accion fallo",
      details: { error: error.message, ai: action.ai || null }
    });
    return respond(
      `No pude completar la accion: ${error.message}`,
      {
        level: "error",
        action: `action.${action.type}.failed`,
        summary: "Accion fallida."
      },
      { skipLog: true, aiMeta: responseAiMeta }
    );
  }
}

function respondConversation(conversationResult, originalText, commandAiResult) {
  const conversationMeta = buildConversationMeta(conversationResult, originalText, commandAiResult);
  logger.writeLog({
    level: conversationResult.intent === "unknown" ? "info" : "info",
    action: `conversation.${conversationResult.intent}`,
    message: conversationResult.intent === "unknown" ? "Respuesta conversacional fallback" : "Respuesta conversacional generada",
    details: {
      intent: conversationResult.intent,
      confidence: conversationResult.confidence,
      responseOrigin: conversationResult.responseOrigin,
      commandIntent: commandAiResult?.intent || null,
      commandConfidence: commandAiResult?.confidence || 0
    }
  });

  return respond(
    conversationResult.reply,
    {
      level: "info",
      action: `conversation.${conversationResult.intent}`,
      summary: "Respuesta conversacional."
    },
    { skipLog: true, aiMeta: conversationMeta }
  );
}

function respondMemory(memoryRequest, originalText) {
  const memoryMeta = buildMemoryMeta(memoryRequest, originalText);

  try {
    const result = memoryEngine.answerMemoryRequest(memoryRequest, {
      history: memory.getMemory().messages
    });

    logger.writeLog({
      level: "info",
      action: result.action,
      message: "Memoria local procesada",
      details: sanitizeLogDetails({
        requestType: memoryRequest.type,
        memoryCount: result.result?.profile?.memories?.length || result.result?.memories?.length || null,
        deletedCount: result.result?.deleted?.length || null
      })
    });

    return respond(
      result.reply,
      {
        level: "info",
        action: result.action,
        summary: "Memoria local procesada."
      },
      { skipLog: true, aiMeta: memoryMeta }
    );
  } catch (error) {
    const isSensitive = error.code === "SENSITIVE_MEMORY";
    logger.writeLog({
      level: isSensitive ? "warn" : "error",
      action: isSensitive ? "memory.sensitive_blocked" : "memory.failed",
      message: error.message,
      details: {
        requestType: memoryRequest.type,
        findingTypes: (error.findings || []).map((finding) => finding.type)
      }
    });

    return respond(
      isSensitive
        ? "No guardo ese recuerdo porque parece contener datos sensibles."
        : `No pude procesar la memoria local: ${error.message}`,
      {
        level: isSensitive ? "warn" : "error",
        action: isSensitive ? "memory.sensitive_blocked" : "memory.failed",
        summary: isSensitive ? "Recuerdo bloqueado por seguridad." : "Memoria local fallida."
      },
      { skipLog: true, aiMeta: memoryMeta }
    );
  }
}

function guardAction(action) {
  const definition = actions.getActionDefinition(action.type);
  if (!definition) {
    return { ok: false, reason: "La accion no esta habilitada." };
  }

  const actionSafety = safety.validateAction(action);
  if (!actionSafety.ok) {
    return { ok: false, reason: actionSafety.reason };
  }

  if (definition.permission && !permissions.isAllowed(definition.permission)) {
    return {
      ok: false,
      reason: `El permiso "${permissions.permissionLabel(definition.permission)}" esta desactivado.`
    };
  }

  if (action.type === "organize_downloads" && !permissions.getSettings().allowFileWrite) {
    return { ok: false, reason: "La escritura de archivos esta desactivada." };
  }

  return { ok: true };
}

function respondBlocked(reason, action, responseAiMeta = buildAiMeta(null, null, false)) {
  logger.writeLog({
    level: "warn",
    action,
    message: reason
  });
  return respond(
    `Solicitud bloqueada por seguridad: ${reason}`,
    {
      level: "warn",
      action,
      summary: "Solicitud bloqueada."
    },
    { skipLog: true, aiMeta: responseAiMeta }
  );
}

function respond(content, logEntry, options = {}) {
  const responseAiMeta = options.aiMeta || buildAiMeta(null, null, false);

  memory.addMessage("assistant", content, {
    aiDomain: responseAiMeta.aiDomain,
    action: logEntry.action,
    level: logEntry.level,
    detectedIntent: responseAiMeta.detectedIntent,
    confidence: responseAiMeta.confidence,
    usedLocalAI: responseAiMeta.usedLocalAI,
    canLearn: responseAiMeta.canLearn,
    canLearnResponse: responseAiMeta.canLearnResponse,
    originalText: responseAiMeta.originalText,
    responseOrigin: responseAiMeta.responseOrigin,
    commandIntent: responseAiMeta.commandIntent || null,
    commandConfidence: responseAiMeta.commandConfidence || 0
  });

  if (!options.skipLog) {
    logger.writeLog({
      level: logEntry.level,
      action: logEntry.action,
      message: logEntry.summary || content.slice(0, 120),
      details: {
        ...(logEntry.details || {}),
        ai: responseAiMeta.usedLocalAI
          ? {
              detectedIntent: responseAiMeta.detectedIntent,
              confidence: responseAiMeta.confidence
            }
          : null
      }
    });
  }

  return {
    ...responseAiMeta,
    reply: content,
    memory: memory.getMemory(),
    logs: logger.getRecentLogs(30)
  };
}

function buildAiMeta(aiResult, originalText, canLearn) {
  return {
    aiDomain: aiResult ? "command" : null,
    detectedIntent: aiResult?.intent || null,
    confidence: Number(aiResult?.confidence || 0),
    usedLocalAI: Boolean(aiResult),
    canLearn: Boolean(canLearn && aiResult && originalText),
    canLearnResponse: false,
    originalText: originalText || null,
    responseOrigin: null
  };
}

function buildConversationMeta(conversationResult, originalText, commandAiResult) {
  return {
    aiDomain: "conversation",
    detectedIntent: conversationResult.intent,
    confidence: Number(conversationResult.confidence || 0),
    usedLocalAI: true,
    canLearn: false,
    canLearnResponse: Boolean(originalText),
    originalText: originalText || null,
    responseOrigin: conversationResult.responseOrigin || "base",
    commandIntent: commandAiResult?.intent || null,
    commandConfidence: Number(commandAiResult?.confidence || 0)
  };
}

function buildMemoryMeta(memoryRequest, originalText) {
  return {
    aiDomain: "memory",
    detectedIntent: `memory.${memoryRequest.type}`,
    confidence: 1,
    usedLocalAI: true,
    canLearn: false,
    canLearnResponse: false,
    originalText: originalText || null,
    responseOrigin: "profile",
    commandIntent: null,
    commandConfidence: 0
  };
}

function sanitizeLogDetails(details) {
  if (!details || typeof details !== "object") return null;
  const clone = { ...details };
  delete clone.text;
  delete clone.content;
  return clone;
}

module.exports = {
  handleMessage
};
