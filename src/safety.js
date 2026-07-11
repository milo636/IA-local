const { sanitizeFileName } = require("./fileManager");

const DANGEROUS_COMMAND_PATTERNS = [
  /^\s*(del|erase|rm|rmdir|remove-item)\b/i,
  /[;&|]\s*(del|erase|rm|rmdir|remove-item)\b/i,
  /\b(format|diskpart|cipher|takeown|icacls)\b/i,
  /\b(reg\s+delete|reg\s+add|set-executionpolicy)\b/i,
  /\b(shutdown|restart-computer|stop-computer)\b/i,
  /\bcurl\b.*\|/i,
  /\bInvoke-WebRequest\b.*\|/i,
  /&&|\|\||;\s*(del|rm|format|shutdown)/i
];

const SENSITIVE_PATTERNS = [
  /\b(password|passwd|pwd|contrasena|contraseña)\b/i,
  /\b(secret|token|api[\s_-]?key|credential|credencial)\b/i,
  /\bprivate\s*key|id_rsa|\.ssh|\.gnupg|\.env\b/i,
  /\bwallet|seed\s*phrase|recovery\s*phrase\b/i
];

const ALLOWED_ACTION_TYPES = new Set([
  "help",
  "open_app",
  "create_desktop_folder",
  "list_downloads",
  "find_files",
  "create_note",
  "system_status",
  "organize_downloads"
]);

function validateIncomingText(text) {
  const value = String(text || "");

  if (value.length > 2000) {
    return deny("El mensaje es demasiado largo para esta version local.");
  }

  if (DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(value))) {
    return deny("Bloquee la solicitud porque parece incluir un comando peligroso.");
  }

  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(value))) {
    return deny("Bloquee la solicitud porque menciona contrasenas, tokens o archivos sensibles.");
  }

  return allow();
}

function validateAction(action) {
  if (!action || !ALLOWED_ACTION_TYPES.has(action.type)) {
    return deny("La accion no esta en la allowlist de SAW Local.");
  }

  if (action.payload?.name) {
    const safeName = sanitizeFileName(action.payload.name);
    if (!safeName || safeName !== action.payload.name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/\s+/g, " ").replace(/^\.+/, "").replace(/[. ]+$/g, "")) {
      return deny("El nombre solicitado no es seguro para Windows.");
    }
  }

  if (action.payload?.term && SENSITIVE_PATTERNS.some((pattern) => pattern.test(action.payload.term))) {
    return deny("No busco archivos relacionados con contrasenas, tokens o secretos.");
  }

  if (action.type === "find_files") {
    const extension = String(action.payload?.extension || "").replace(/^\./, "");
    if (extension && !/^[a-z0-9]{1,10}$/i.test(extension)) {
      return deny("La extension solicitada no es valida.");
    }

    if (action.payload?.category && !["images", "documents"].includes(action.payload.category)) {
      return deny("La categoria de busqueda no esta permitida.");
    }

    const limit = Number(action.payload?.limit || 50);
    if (!Number.isFinite(limit) || limit < 1 || limit > 100) {
      return deny("El limite de resultados debe estar entre 1 y 100.");
    }
  }

  return allow();
}

function requiresConfirmation(action, settings) {
  if (!action) return false;
  if (action.requiresConfirmation) return true;
  if (action.type === "organize_downloads") return true;
  if (action.type === "create_note" && String(action.payload?.text || "").length > 5000) return true;
  return Boolean(settings.safeMode && action.risk === "high");
}

function allow() {
  return { ok: true };
}

function deny(reason) {
  return { ok: false, reason };
}

module.exports = {
  ALLOWED_ACTION_TYPES,
  DANGEROUS_COMMAND_PATTERNS,
  SENSITIVE_PATTERNS,
  requiresConfirmation,
  validateAction,
  validateIncomingText
};
