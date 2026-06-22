function parseCommand(message) {
  const raw = String(message || "").trim();
  const normalized = normalize(raw);

  if (["ayuda", "help", "/help", "?"].includes(normalized)) {
    return action("help");
  }

  if (/^abrir\s+(google\s+)?chrome$/.test(normalized)) {
    return action("open_app", { app: "chrome" });
  }

  if (/^abrir\s+(bloc\s+de\s+notas|notepad)$/.test(normalized)) {
    return action("open_app", { app: "notepad" });
  }

  if (/^abrir\s+(explorador|explorador\s+de\s+archivos|file\s+explorer)$/.test(normalized)) {
    return action("open_app", { app: "explorer" });
  }

  const folderMatch = raw.match(/^crear\s+carpeta\s+llamada\s+(.+?)(?:\s+en\s+(?:el\s+)?escritorio)?$/i);
  if (folderMatch) {
    return action("create_desktop_folder", { name: folderMatch[1].trim() });
  }

  if (/^listar\s+archivos\s+de\s+descargas$/.test(normalized)) {
    return action("list_downloads");
  }

  const searchMatch = raw.match(/^buscar\s+archivos\s+que\s+contengan\s+(.+)$/i);
  if (searchMatch) {
    return action("find_files", { term: searchMatch[1].trim() });
  }

  const noteMatch = raw.match(/^crear\s+nota\s+llamada\s+(.+?)\s+con\s+este\s+texto:\s*([\s\S]+)$/i);
  if (noteMatch) {
    return action("create_note", {
      name: noteMatch[1].trim(),
      text: noteMatch[2].trim()
    });
  }

  if (/^(mostrar\s+)?estado\s+del\s+sistema$/.test(normalized) || normalized === "sistema") {
    return action("system_status");
  }

  if (/^organizar\s+descargas\s+por\s+tipo$/.test(normalized)) {
    return action("organize_downloads", {}, { requiresConfirmation: true, risk: "high" });
  }

  return {
    type: "unknown",
    original: raw
  };
}

function parseActionFromIntent(intent, message) {
  const exactAction = parseCommand(message);
  if (exactAction.type !== "unknown") return exactAction;

  const raw = String(message || "").trim();
  const normalized = normalize(raw);

  if (intent === "help") {
    return action("help");
  }

  if (intent === "open_app") {
    const app = extractApp(normalized);
    return app ? action("open_app", { app }) : unknown(raw);
  }

  if (intent === "create_folder") {
    const name = extractFolderName(raw);
    return name ? action("create_desktop_folder", { name }) : unknown(raw);
  }

  if (intent === "list_downloads") {
    return action("list_downloads");
  }

  if (intent === "search_files") {
    const term = extractSearchTerm(raw);
    return term ? action("find_files", { term }) : unknown(raw);
  }

  if (intent === "create_note") {
    const note = extractNote(raw);
    return note ? action("create_note", note) : unknown(raw);
  }

  if (intent === "system_status") {
    return action("system_status");
  }

  if (intent === "organize_downloads") {
    return action("organize_downloads", {}, { requiresConfirmation: true, risk: "high" });
  }

  return unknown(raw);
}

function action(type, payload = {}, extra = {}) {
  return {
    type,
    payload,
    original: null,
    requiresConfirmation: false,
    risk: "low",
    ...extra
  };
}

function unknown(original) {
  return {
    type: "unknown",
    original
  };
}

function extractApp(normalized) {
  if (/\bchrome\b/.test(normalized)) return "chrome";
  if (/\b(bloc de notas|notepad)\b/.test(normalized)) return "notepad";
  if (/\b(explorador|explorador de archivos|file explorer)\b/.test(normalized)) return "explorer";
  return null;
}

function extractFolderName(raw) {
  const match = raw.match(/(?:crear|crea|hacer|hace|nueva|necesito)\s+(?:una\s+)?carpeta(?:\s+(?:llamada|con\s+nombre|nombre))?\s+(.+?)(?:\s+en\s+(?:el\s+)?escritorio)?$/i);
  if (!match) return null;

  const name = match[1].trim();
  return normalize(name) === "carpeta" ? null : name;
}

function extractSearchTerm(raw) {
  const match = raw.match(/(?:buscar|busca|encontrar|encuentra|localizar|localiza)\s+(?:archivos?\s+)?(?:que\s+contengan\s+|con\s+|llamados?\s+|sobre\s+)?(.+)$/i);
  return match?.[1]?.trim() || null;
}

function extractNote(raw) {
  const match = raw.match(/(?:crear|guardar|escribir|nueva)\s+(?:archivo\s+de\s+)?nota\s+(?:llamada|llamado)\s+(.+?)\s+con\s+este\s+texto[: ]\s*([\s\S]+)$/i);
  if (!match) return null;

  return {
    name: match[1].trim(),
    text: match[2].trim()
  };
}

function normalize(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

module.exports = {
  normalize,
  parseActionFromIntent,
  parseCommand
};
