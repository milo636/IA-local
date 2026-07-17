const actions = require("./actions");
const conversationAI = require("./conversationAI");
const favorites = require("./favorites");
const logger = require("./logger");
const localAI = require("./localAI");
const memory = require("./memory");
const memoryEngine = require("./memoryEngine");
const permissions = require("./permissions");
const routines = require("./routines");
const safety = require("./safety");
const { parseActionFromIntent, parseCommand } = require("./commandParser");
const {
  clarificationPrompt,
  detectContextFollowUp,
  extractEntities,
  resolveClarification,
  sanitizeEntitiesForDebug
} = require("./entityExtractor");

async function handleMessage(message) {
  const text = String(message || "").trim();
  if (text.length > 2000) {
    return respondBlocked("El mensaje supera el limite local de 2000 caracteres.", "input.too_long", buildAiMeta(null, null, false));
  }
  memory.addMessage("user", text);

  if (text.toUpperCase() === "CONFIRMAR") {
    return executePendingAction();
  }

  cancelPendingActionIfUserContinues(text);

  const incomingSafety = safety.validateIncomingText(text);
  if (!incomingSafety.ok) {
    return respondBlocked(incomingSafety.reason, "input.blocked", buildAiMeta(null, text, false));
  }

  const clarificationResponse = await handlePendingClarification(text);
  if (clarificationResponse) return clarificationResponse;

  const contextResponse = await handleContextFollowUp(text);
  if (contextResponse) return contextResponse;

  const memoryRequest = memoryEngine.parseMemoryRequest(text);
  if (memoryRequest) {
    return respondMemory(memoryRequest, text);
  }

  const productivityRequest = parseProductivityRequest(text);
  if (productivityRequest) {
    return handleProductivityRequest(productivityRequest);
  }

  const aiResult = localAI.classifyIntent(text);
  const entityResult = extractEntities(text, aiResult.intent, {
    context: memory.getCommandContext()
  });
  return processClassifiedCommand(text, aiResult, entityResult);
}

async function processClassifiedCommand(text, aiResult, entityResult, options = {}) {
  const originalText = options.originalText || text;
  const responseAiMeta = buildAiMeta(aiResult, originalText, true, {
    entities: entityResult.sanitized,
    contextUsed: entityResult.usedContext,
    requiresClarification: entityResult.missing.length > 0
  });
  const parsedAction = parseActionFromIntent(aiResult.intent, text, {
    entities: entityResult.entities,
    context: memory.getCommandContext()
  });
  parsedAction.original = text;
  const conversationResult = conversationAI.respondToConversation(text, {
    history: memory.getMemory().messages
  });

  if (!options.skipConversation && !entityResult.missing.length && shouldUseConversation(text, parsedAction, conversationResult)) {
    return respondConversation(conversationResult, text, aiResult);
  }

  if (aiResult.intent !== "unknown" && entityResult.missing.length) {
    const pending = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
      intent: aiResult.intent,
      entities: entityResult.entities,
      missing: entityResult.missing,
      originalText,
      ai: aiResult,
      createdAt: new Date().toISOString()
    };
    memory.setPendingClarification(pending);
    logger.writeLog({
      level: "info",
      action: "command.clarification_requested",
      message: "Atenea solicito un dato faltante",
      details: { intent: pending.intent, missing: pending.missing }
    });
    return respond(
      clarificationPrompt(aiResult.intent, entityResult.missing),
      { level: "info", action: "command.clarification_requested", summary: "Dato faltante solicitado." },
      { skipLog: true, aiMeta: responseAiMeta }
    );
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
    confidence: aiResult.confidence,
    secondIntent: aiResult.secondIntent,
    margin: aiResult.margin
  };
  parsedAction.aiMeta = responseAiMeta;

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
      { skipLog: true, aiMeta: { ...responseAiMeta, requiresConfirmation: true } }
    );
  }

  return executeAllowedAction(parsedAction);
}

async function handlePendingClarification(text) {
  const pending = memory.getPendingClarification();
  if (!pending) return null;

  if (/^(cancelar|cancela|olvidalo)$/i.test(text)) {
    memory.clearPendingClarification();
    logger.writeLog({ level: "info", action: "command.clarification_cancelled", message: "Aclaracion cancelada por el usuario" });
    return respond(
      "Listo, cancele la accion pendiente.",
      { level: "info", action: "command.clarification_cancelled", summary: "Aclaracion cancelada." },
      { skipLog: true, aiMeta: buildAiMeta(pending.ai, pending.originalText, true, { fallbackReason: "cancelled" }) }
    );
  }

  const resolved = resolveClarification(pending, text);
  if (resolved.missing.length) {
    memory.setPendingClarification({ ...pending, entities: resolved.entities, missing: resolved.missing });
    return respond(
      clarificationPrompt(pending.intent, resolved.missing),
      { level: "info", action: "command.clarification_requested", summary: "La aclaracion sigue incompleta." },
      {
        skipLog: true,
        aiMeta: buildAiMeta(pending.ai, pending.originalText, true, {
          entities: resolved.sanitized,
          contextUsed: resolved.usedContext,
          requiresClarification: true
        })
      }
    );
  }

  memory.clearPendingClarification();
  logger.writeLog({
    level: "info",
    action: "command.clarification_resolved",
    message: "Dato faltante completado",
    details: { intent: pending.intent }
  });
  return processClassifiedCommand(pending.originalText, pending.ai, resolved, {
    originalText: pending.originalText,
    skipConversation: true
  });
}

async function handleContextFollowUp(text) {
  const context = memory.getCommandContext();
  const followUp = detectContextFollowUp(text, context);
  if (!followUp) return null;

  if (followUp.type === "save_favorite") {
    try {
      const favorite = favorites.createFavorite({ command: followUp.command });
      logger.writeLog({
        level: "info",
        action: "favorite.create_from_context",
        message: "Comando anterior guardado como favorito",
        details: { favoriteId: favorite.id, actionType: favorite.actionType }
      });
      return respond(
        `Favorito guardado: ${favorite.name}`,
        { level: "info", action: "favorite.create_from_context", summary: "Favorito creado desde contexto." },
        { skipLog: true, aiMeta: buildAiMeta(null, text, false, { contextUsed: followUp.usedContext }) }
      );
    } catch (error) {
      return respond(
        `No pude guardar el comando anterior como favorito: ${error.message}`,
        { level: "warn", action: "favorite.create_from_context.failed", summary: "No se pudo crear el favorito." },
        { aiMeta: buildAiMeta(null, text, false, { contextUsed: followUp.usedContext }) }
      );
    }
  }

  if (followUp.type === "already_executed_correction") {
    return respond(
      "La accion anterior ya se ejecuto. No voy a renombrar ni modificar archivos automaticamente; podes pedirme una accion nueva.",
      { level: "info", action: "context.correction_not_executed", summary: "Correccion posterior no ejecutada." },
      { aiMeta: buildAiMeta(null, text, false, { contextUsed: followUp.usedContext, fallbackReason: "already_executed" }) }
    );
  }

  const aiResult = {
    intent: followUp.intent,
    confidence: 1,
    secondIntent: null,
    secondConfidence: 0,
    margin: 1,
    relevantWords: [],
    ambiguous: false,
    fallbackReason: null
  };
  const entityResult = {
    entities: followUp.entities,
    missing: [],
    usedContext: followUp.usedContext,
    sanitized: sanitizeEntitiesForDebug(followUp.entities)
  };
  return processClassifiedCommand(text, aiResult, entityResult, { skipConversation: true });
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

  if (!pending.continuation) {
    return executeAllowedAction(pending.action, { confirmed: true, pendingId: pending.id });
  }

  try {
    const result = await performAllowedAction(pending.action, {
      confirmed: true,
      pendingId: pending.id,
      source: pending.continuation.source,
      sourceId: pending.continuation.sourceId
    });
    return runStoredActionSequence(pending.continuation.actions || [], {
      ...pending.continuation,
      completedMessages: [...(pending.continuation.completedMessages || []), result.message]
    });
  } catch (error) {
    return respond(
      `No pude continuar la automatizacion: ${error.message}`,
      {
        level: "error",
        action: "productivity.run.failed",
        summary: "Automatizacion interrumpida."
      },
      { skipLog: true }
    );
  }
}

async function executeAllowedAction(action, meta = {}) {
  const responseAiMeta = action.aiMeta || buildAiMeta(action.ai, action.original, Boolean(action.ai));

  try {
    const result = await performAllowedAction(action, meta);
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

async function performAllowedAction(action, meta = {}) {
  try {
    const result = await actions.executeAction(action);
    rememberCommandContext(action);
    logger.writeLog({
      level: "info",
      action: `action.${action.type}`,
      message: result.summary || "Accion ejecutada",
      details: sanitizeLogDetails({
        ...result.details,
        ai: action.ai || null,
        confirmed: Boolean(meta.confirmed),
        pendingId: meta.pendingId || null,
        source: meta.source || null,
        sourceId: meta.sourceId || null
      })
    });
    return result;
  } catch (error) {
    logger.writeLog({
      level: "error",
      action: `action.${action.type}.failed`,
      message: "La accion fallo",
      details: {
        error: error.message,
        ai: action.ai || null,
        source: meta.source || null,
        sourceId: meta.sourceId || null
      }
    });
    throw error;
  }
}

async function runStoredCommands(commands, meta = {}) {
  if (!Array.isArray(commands) || !commands.length || commands.length > 10) {
    throw new Error("La automatizacion debe contener entre 1 y 10 comandos permitidos.");
  }

  const parsedActions = commands.map((command) => {
    const validated = favorites.validateStoredCommand(command);
    return {
      ...validated.action,
      original: validated.command,
      ai: null
    };
  });

  return runStoredActionSequence(parsedActions, {
    completedMessages: [],
    source: meta.source || "stored",
    sourceId: meta.sourceId || null,
    sourceName: meta.sourceName || null
  });
}

async function runStoredActionSequence(storedActions, context) {
  const completedMessages = [...(context.completedMessages || [])];

  for (let index = 0; index < storedActions.length; index += 1) {
    const action = storedActions[index];
    const guard = guardAction(action);
    if (!guard.ok) {
      logger.writeLog({
        level: "warn",
        action: "productivity.run.denied",
        message: guard.reason,
        details: { source: context.source, sourceId: context.sourceId, type: action.type }
      });
      const prefix = completedMessages.length ? `${completedMessages.join("\n\n")}\n\n` : "";
      return respond(
        `${prefix}Automatizacion detenida por seguridad: ${guard.reason}`,
        { level: "warn", action: "productivity.run.denied", summary: "Automatizacion bloqueada." },
        { skipLog: true }
      );
    }

    if (safety.requiresConfirmation(action, permissions.getSettings())) {
      const pendingAction = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        action,
        reason: "Una accion guardada puede mover o modificar archivos locales.",
        createdAt: new Date().toISOString(),
        continuation: {
          actions: storedActions.slice(index + 1),
          completedMessages,
          source: context.source,
          sourceId: context.sourceId,
          sourceName: context.sourceName
        }
      };
      memory.setPendingAction(pendingAction);
      logger.writeLog({
        level: "warn",
        action: "productivity.pending_confirmation",
        message: "Automatizacion pausada para confirmar una accion",
        details: {
          pendingId: pendingAction.id,
          source: context.source,
          sourceId: context.sourceId,
          type: action.type,
          remainingSteps: pendingAction.continuation.actions.length
        }
      });

      const prefix = completedMessages.length ? `${completedMessages.join("\n\n")}\n\n` : "";
      return respond(
        `${prefix}Esta accion necesita confirmacion. Escribi CONFIRMAR para continuar.`,
        { level: "warn", action: "productivity.pending_confirmation", summary: "Automatizacion pendiente de confirmacion." },
        { skipLog: true }
      );
    }

    try {
      const result = await performAllowedAction(action, {
        source: context.source,
        sourceId: context.sourceId
      });
      completedMessages.push(result.message);
    } catch (error) {
      return respond(
        `${completedMessages.length ? `${completedMessages.join("\n\n")}\n\n` : ""}Automatizacion detenida: ${error.message}`,
        { level: "error", action: "productivity.run.failed", summary: "Automatizacion interrumpida." },
        { skipLog: true }
      );
    }
  }

  logger.writeLog({
    level: "info",
    action: `productivity.${context.source}.completed`,
    message: "Automatizacion local completada",
    details: {
      sourceId: context.sourceId,
      sourceName: context.sourceName,
      completedSteps: completedMessages.length
    }
  });

  return respond(
    completedMessages.join("\n\n") || "La automatizacion no tenia acciones pendientes.",
    { level: "info", action: `productivity.${context.source}.completed`, summary: "Automatizacion completada." },
    { skipLog: true }
  );
}

async function handleProductivityRequest(request) {
  try {
    if (request.type === "favorite.create") {
      const favorite = favorites.createFavorite(request);
      logger.writeLog({ level: "info", action: "favorite.create", message: "Favorito local creado", details: { favoriteId: favorite.id, actionType: favorite.actionType } });
      return respond(`Favorito guardado: ${favorite.name}\nComando: ${favorite.command}`, { level: "info", action: "favorite.create", summary: "Favorito creado." }, { skipLog: true });
    }

    if (request.type === "favorite.list") {
      const items = favorites.listFavorites();
      const reply = items.length ? `Favoritos guardados:\n${items.map((item) => `- ${item.name}: ${item.command}`).join("\n")}` : "No hay favoritos guardados.";
      return respond(reply, { level: "info", action: "favorite.list", summary: "Favoritos listados." });
    }

    if (request.type === "favorite.delete") {
      const favorite = favorites.deleteFavorite(request.reference);
      logger.writeLog({ level: "info", action: "favorite.delete", message: "Favorito local borrado", details: { favoriteId: favorite.id } });
      return respond(`Favorito borrado: ${favorite.name}`, { level: "info", action: "favorite.delete", summary: "Favorito borrado." }, { skipLog: true });
    }

    if (request.type === "favorite.run") {
      const favorite = favorites.findFavorite(request.reference);
      if (!favorite) throw new Error("No encontre ese favorito.");
      return runStoredCommands([favorite.command], { source: "favorite", sourceId: favorite.id, sourceName: favorite.name });
    }

    if (request.type === "routine.create") {
      const routine = routines.createRoutine(request);
      logger.writeLog({ level: "info", action: "routine.create", message: "Rutina local creada", details: { routineId: routine.id, steps: routine.steps.length } });
      return respond(`Rutina guardada: ${routine.name}\n${routine.steps.map((step) => `${step.order}. ${step.command}`).join("\n")}`, { level: "info", action: "routine.create", summary: "Rutina creada." }, { skipLog: true });
    }

    if (request.type === "routine.list") {
      const items = routines.listRoutines();
      const reply = items.length ? `Rutinas guardadas:\n${items.map((item) => `- ${item.name}: ${item.steps.length} acciones`).join("\n")}` : "No hay rutinas guardadas.";
      return respond(reply, { level: "info", action: "routine.list", summary: "Rutinas listadas." });
    }

    if (request.type === "routine.delete") {
      const routine = routines.deleteRoutine(request.reference);
      logger.writeLog({ level: "info", action: "routine.delete", message: "Rutina local borrada", details: { routineId: routine.id } });
      return respond(`Rutina borrada: ${routine.name}`, { level: "info", action: "routine.delete", summary: "Rutina borrada." }, { skipLog: true });
    }

    if (request.type === "routine.run") {
      const routine = routines.findRoutine(request.reference);
      if (!routine) throw new Error("No encontre esa rutina.");
      return runStoredCommands(routine.steps.map((step) => step.command), { source: "routine", sourceId: routine.id, sourceName: routine.name });
    }
  } catch (error) {
    logger.writeLog({ level: "warn", action: `${request.type}.denied`, message: error.message });
    return respond(`No pude procesar la solicitud: ${error.message}`, { level: "warn", action: `${request.type}.denied`, summary: "Solicitud de productividad rechazada." }, { skipLog: true });
  }

  return null;
}

function parseProductivityRequest(text) {
  const raw = String(text || "").trim();
  if (/^mostrar\s+favoritos$/i.test(raw)) return { type: "favorite.list" };
  if (/^mostrar\s+rutinas$/i.test(raw)) return { type: "routine.list" };

  let match = raw.match(/^guardar\s+como\s+favorito\s+llamado\s+(.+?):\s*(.+)$/i);
  if (match) return { type: "favorite.create", name: match[1].trim(), command: match[2].trim() };

  match = raw.match(/^guardar\s+como\s+favorito\s+(.+)$/i);
  if (match) return { type: "favorite.create", command: match[1].trim() };

  match = raw.match(/^ejecutar\s+favorito\s+(.+)$/i);
  if (match) return { type: "favorite.run", reference: match[1].trim() };

  match = raw.match(/^borrar\s+favorito\s+(.+)$/i);
  if (match) return { type: "favorite.delete", reference: match[1].trim() };

  match = raw.match(/^crear\s+rutina\s+llamada\s+(.+?)\s+con\s+(.+)$/i);
  if (match) {
    return {
      type: "routine.create",
      name: match[1].trim(),
      commands: match[2].split(/\s+y\s+/i).map((command) => command.trim()).filter(Boolean)
    };
  }

  match = raw.match(/^ejecutar\s+rutina\s+(.+)$/i);
  if (match) return { type: "routine.run", reference: match[1].trim() };

  match = raw.match(/^borrar\s+rutina\s+(.+)$/i);
  if (match) return { type: "routine.delete", reference: match[1].trim() };
  return null;
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
    commandConfidence: responseAiMeta.commandConfidence || 0,
    secondIntent: responseAiMeta.secondIntent || null,
    secondConfidence: responseAiMeta.secondConfidence || 0,
    margin: responseAiMeta.margin || 0,
    relevantWords: responseAiMeta.relevantWords || [],
    entities: responseAiMeta.entities || {},
    contextUsed: responseAiMeta.contextUsed || [],
    fallbackReason: responseAiMeta.fallbackReason || null,
    ambiguous: Boolean(responseAiMeta.ambiguous),
    requiresClarification: Boolean(responseAiMeta.requiresClarification),
    requiresConfirmation: Boolean(responseAiMeta.requiresConfirmation)
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

function buildAiMeta(aiResult, originalText, canLearn, extra = {}) {
  return {
    aiDomain: aiResult ? "command" : null,
    detectedIntent: aiResult?.intent || null,
    confidence: Number(aiResult?.confidence || 0),
    usedLocalAI: Boolean(aiResult),
    canLearn: Boolean(canLearn && aiResult && originalText),
    canLearnResponse: false,
    originalText: originalText || null,
    responseOrigin: null,
    secondIntent: aiResult?.secondIntent || null,
    secondConfidence: Number(aiResult?.secondConfidence || 0),
    margin: Number(aiResult?.margin || 0),
    relevantWords: aiResult?.relevantWords || [],
    entities: extra.entities || {},
    contextUsed: extra.contextUsed || [],
    fallbackReason: extra.fallbackReason || aiResult?.fallbackReason || null,
    ambiguous: Boolean(aiResult?.ambiguous),
    requiresClarification: Boolean(extra.requiresClarification),
    requiresConfirmation: Boolean(extra.requiresConfirmation)
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

function rememberCommandContext(action) {
  const intentByAction = {
    help: "help",
    open_app: "open_app",
    create_desktop_folder: "create_folder",
    list_downloads: "list_downloads",
    find_files: "search_files",
    create_note: "create_note",
    system_status: "system_status",
    organize_downloads: "organize_downloads"
  };
  const intent = action.ai?.intent || intentByAction[action.type] || null;
  if (!intent || action.type === "help") return;

  const entities = {};
  if (action.type === "open_app") entities.app = action.payload.app;
  if (action.type === "create_desktop_folder") entities.folderName = action.payload.name;
  if (action.type === "find_files") {
    entities.searchTerm = action.payload.term;
    if (action.payload.extension) entities.extension = action.payload.extension;
    if (action.payload.category) entities.category = action.payload.category;
    if (action.payload.limit) entities.limit = action.payload.limit;
  }
  if (action.type === "create_note") entities.noteName = action.payload.name;

  memory.setCommandContext({
    intent,
    actionType: action.type,
    entities,
    originalText: action.original,
    storableCommand: toStoredCommand(action),
    executed: true,
    updatedAt: new Date().toISOString()
  });
}

function toStoredCommand(action) {
  if (action.type === "open_app") return `abrir ${action.payload.app}`;
  if (action.type === "list_downloads") return "listar archivos de descargas";
  if (action.type === "system_status") return "mostrar estado del sistema";
  if (action.type === "organize_downloads") return "organizar descargas por tipo";
  if (action.type === "create_desktop_folder") return `crear carpeta llamada ${action.payload.name} en escritorio`;
  if (action.type === "create_note") return `crear nota llamada ${action.payload.name} con este texto: ${action.payload.text}`;
  if (action.type === "find_files") {
    const extension = action.payload.extension ? ` ${action.payload.extension}` : "";
    const limit = action.payload.limit ? ` limite ${action.payload.limit}` : "";
    return `buscar archivos${extension} que contengan ${action.payload.term}${limit}`;
  }
  return action.original;
}

module.exports = {
  handleMessage,
  parseProductivityRequest,
  runStoredCommands
};
