const actions = require("./actions");
const permissions = require("./permissions");

const QUESTION_PATTERNS = [
  {
    type: "safety",
    patterns: [
      /\b(es|seria|resulta) segur[oa]\b/,
      /\b(eso|esa accion|esa tarea) es segur[oa]\b/,
      /\bque riesgo\b/,
      /\btiene riesgo\b/,
      /\bes peligros[oa]\b/,
      /\bpuede borrar\b/
    ]
  },
  {
    type: "permission",
    patterns: [
      /\bque permiso\b/,
      /\bcual permiso\b/,
      /\bpermiso (usa|necesita|requiere)\b/,
      /\btengo permiso\b/
    ]
  },
  {
    type: "why",
    patterns: [
      /^por que\b/,
      /\bpor que (necesita|pedis|pide|requiere|no)\b/,
      /\bpara que necesita confirmacion\b/
    ]
  },
  {
    type: "what",
    patterns: [
      /\bque hiciste\b/,
      /\bque paso recien\b/,
      /\bque accion (fue|hiciste|ejecutaste)\b/,
      /\bexplica(me)? (eso|la accion anterior)\b/,
      /\bque significa eso\b/
    ]
  },
  {
    type: "context",
    patterns: [
      /\bcontexto activo\b/,
      /\bque (tenes|hay) en contexto\b/,
      /\bque recordas de esta conversacion\b/,
      /\bcual fue la accion anterior\b/
    ]
  }
];

const ACTION_LABELS = {
  help: "mostrar la ayuda",
  open_app: "abrir una aplicacion permitida",
  create_desktop_folder: "crear una carpeta en el Escritorio",
  list_downloads: "listar archivos visibles de Descargas",
  find_files: "buscar nombres de archivos locales",
  create_note: "crear una nota local",
  system_status: "mostrar el estado basico del sistema",
  organize_downloads: "organizar archivos de Descargas"
};

const INTENT_ACTIONS = {
  help: "help",
  open_app: "open_app",
  create_folder: "create_desktop_folder",
  list_downloads: "list_downloads",
  search_files: "find_files",
  create_note: "create_note",
  system_status: "system_status",
  organize_downloads: "organize_downloads"
};

const MISSING_LABELS = {
  app: "la aplicacion",
  folderName: "el nombre de la carpeta",
  noteName: "el nombre de la nota",
  noteText: "el texto de la nota",
  searchTerm: "el termino de busqueda"
};

function detectContextQuestion(text) {
  const normalized = normalize(text);
  if (!normalized || normalized.length > 180) return null;
  for (const group of QUESTION_PATTERNS) {
    if (group.patterns.some((pattern) => pattern.test(normalized))) return group.type;
  }
  return null;
}

function explainContext(text, memoryState, settings = {}) {
  const questionType = detectContextQuestion(text);
  if (!questionType) return null;
  const snapshot = getContextSnapshot(memoryState, settings);
  if (questionType === "safety" && snapshot.status === "empty") return null;
  return {
    intent: `context.${questionType}`,
    confidence: 1,
    responseOrigin: "structured_context",
    reply: answerQuestion(questionType, snapshot),
    snapshot
  };
}

function getContextSnapshot(memoryState = {}, settings = {}) {
  if (memoryState.pendingAction?.action) {
    return actionSnapshot(memoryState.pendingAction.action, settings, {
      status: "pending_confirmation",
      executed: false,
      updatedAt: memoryState.pendingAction.createdAt || null
    });
  }

  if (memoryState.pendingClarification) {
    const missing = Array.isArray(memoryState.pendingClarification.missing)
      ? memoryState.pendingClarification.missing.filter((item) => MISSING_LABELS[item])
      : [];
    const missingText = missing.map((item) => MISSING_LABELS[item]).join(", ");
    const actionType = INTENT_ACTIONS[memoryState.pendingClarification.intent] || null;
    return {
      ...actionSnapshot({ type: actionType }, settings, {
        status: "pending_clarification",
        executed: false,
        intent: memoryState.pendingClarification.intent,
        updatedAt: memoryState.pendingClarification.createdAt || null
      }),
      summary: missingText
        ? `Todavia no ejecute nada. Falta ${missingText}.`
        : "Todavia no ejecute nada porque falta completar la solicitud.",
      canClear: false
    };
  }

  if (memoryState.commandContext?.actionType) {
    return actionSnapshot({ type: memoryState.commandContext.actionType }, settings, {
      status: memoryState.commandContext.executed ? "completed" : "prepared",
      executed: Boolean(memoryState.commandContext.executed),
      intent: memoryState.commandContext.intent,
      updatedAt: memoryState.commandContext.updatedAt || null,
      canClear: true
    });
  }

  return emptySnapshot();
}

function actionSnapshot(action, settings, overrides = {}) {
  const type = ACTION_LABELS[action?.type] ? action.type : null;
  const definition = type ? actions.getActionDefinition(type) : null;
  const permissionKey = definition?.permission || null;
  const permissionEnabled = permissionKey ? Boolean(settings[permissionKey]) : null;
  const status = overrides.status || "prepared";
  const executed = Boolean(overrides.executed);
  const label = actionLabel(type);
  return {
    status,
    badge: statusBadge(status),
    summary: actionSummary(status, label),
    actionType: type,
    actionLabel: label,
    intent: safeIntent(overrides.intent),
    permissionKey,
    permissionLabel: permissionKey ? permissions.permissionLabel(permissionKey) : "No requiere permiso especial",
    permissionEnabled,
    requiresConfirmation: status === "pending_confirmation" || Boolean(definition?.requiresConfirmation),
    executed,
    updatedAt: overrides.updatedAt || null,
    canClear: Boolean(overrides.canClear)
  };
}

function answerQuestion(questionType, snapshot) {
  if (snapshot.status === "empty") {
    return "No tengo una accion local activa para explicar. Podes pedirme una tarea y despues preguntarme que hice, que permiso uso o si fue segura.";
  }

  if (questionType === "permission") {
    if (!snapshot.permissionKey) {
      return `La accion en contexto es ${snapshot.actionLabel}. No necesita un permiso especial, pero sigue limitada por la allowlist y el modo seguro.`;
    }
    const status = snapshot.permissionEnabled ? "esta activo" : "esta desactivado";
    return `La accion en contexto es ${snapshot.actionLabel}. Usa el permiso "${snapshot.permissionLabel}", que ${status}. Preguntar esto no ejecuta la accion.`;
  }

  if (questionType === "safety") {
    if (snapshot.status === "pending_confirmation") {
      return `Todavia no ejecute la accion. Se trata de ${snapshot.actionLabel} y necesita confirmacion porque puede modificar archivos locales. Si no estas seguro, no escribas CONFIRMAR.`;
    }
    if (snapshot.status === "pending_clarification") {
      return `${snapshot.summary} Pedir el dato faltante no ejecuta acciones.`;
    }
    if (snapshot.executed) {
      return `La accion anterior fue ${snapshot.actionLabel}. Ya se ejecuto despues de pasar por la allowlist, safety y los permisos locales.`;
    }
    return `El contexto corresponde a ${snapshot.actionLabel}. No hay una ejecucion pendiente y esta explicacion es de solo lectura.`;
  }

  if (questionType === "why") {
    if (snapshot.status === "pending_confirmation") {
      return `Pedi confirmacion porque ${snapshot.actionLabel} puede modificar archivos locales. La accion sigue detenida hasta que escribas CONFIRMAR.`;
    }
    if (snapshot.status === "pending_clarification") return snapshot.summary;
    return `${snapshot.summary} No voy a repetir ni ejecutar la accion por responder esta pregunta.`;
  }

  return `${snapshot.summary} Esta explicacion usa solo metadatos locales y no repite el contenido privado del mensaje.`;
}

function emptySnapshot() {
  return {
    status: "empty",
    badge: "Sin contexto",
    summary: "No hay una accion local activa en esta conversacion.",
    actionType: null,
    actionLabel: "Ninguna accion local",
    intent: null,
    permissionKey: null,
    permissionLabel: "No requerido",
    permissionEnabled: null,
    requiresConfirmation: false,
    executed: false,
    updatedAt: null,
    canClear: false
  };
}

function actionLabel(type) {
  return ACTION_LABELS[type] || "una accion local permitida";
}

function actionSummary(status, label) {
  if (status === "pending_confirmation") return `La accion ${label} esta detenida y espera confirmacion.`;
  if (status === "completed") return `La accion anterior fue ${label} y ya termino.`;
  if (status === "response") return `La respuesta anterior se relaciono con ${label}, sin volver a ejecutarla.`;
  return `La accion en contexto es ${label}.`;
}

function statusBadge(status) {
  return {
    pending_confirmation: "Confirmacion pendiente",
    pending_clarification: "Falta informacion",
    completed: "Accion anterior",
    prepared: "Contexto preparado",
    response: "Respuesta anterior"
  }[status] || "Contexto local";
}

function safeIntent(intent) {
  const value = String(intent || "").trim();
  return /^[a-z_]+$/.test(value) ? value : null;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  detectContextQuestion,
  explainContext,
  getContextSnapshot
};
