const { cleanText } = require("./localAI");
const { detectSensitiveText } = require("./sensitiveText");

const EXTENSION_ALIASES = {
  documentos: { category: "documents" },
  documento: { category: "documents" },
  imagenes: { category: "images" },
  imagen: { category: "images" },
  fotos: { category: "images" },
  foto: { category: "images" }
};

function extractEntities(text, intent = null, options = {}) {
  const raw = String(text || "").trim();
  const normalized = cleanText(raw);
  const context = options.context || null;
  const entities = {};
  const usedContext = [];

  const app = extractApp(normalized);
  if (app) entities.app = app;

  const folderName = extractFolderName(raw);
  if (folderName) entities.folderName = folderName;

  const note = extractNote(raw);
  if (note.name) entities.noteName = note.name;
  if (note.text) entities.noteText = note.text;

  const search = extractSearch(raw);
  Object.assign(entities, search);

  const favoriteName = extractNamedReference(raw, "favorito");
  if (favoriteName) entities.favoriteName = favoriteName;
  const routineName = extractNamedReference(raw, "rutina");
  if (routineName) entities.routineName = routineName;

  if (context?.intent === "search_files" && intent === "search_files") {
    if (!entities.searchTerm && context.entities?.searchTerm) {
      entities.searchTerm = context.entities.searchTerm;
      usedContext.push("searchTerm");
    }
  }

  const missing = missingEntities(intent, entities);
  return {
    entities,
    missing,
    usedContext,
    sanitized: sanitizeEntitiesForDebug(entities)
  };
}

function extractApp(normalized) {
  if (/\b(chrome|google chrome|navegador)\b/.test(normalized)) return "chrome";
  if (/\b(bloc de notas|notepad)\b/.test(normalized)) return "notepad";
  if (/\b(explorador|explorador de archivos|file explorer)\b/.test(normalized)) return "explorer";
  return null;
}

function extractFolderName(raw) {
  const patterns = [
    /carpeta(?:\s+(?:llamada|que\s+se\s+llame|con\s+nombre))\s+(.+?)(?:\s+en\s+(?:el\s+)?escritorio)?$/i,
    /carpeta\s+(.+?)(?:\s+en\s+(?:el\s+)?escritorio)?$/i
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1] && !/^(en\s+)?(?:el\s+)?escritorio$/i.test(match[1].trim())) return cleanEntity(match[1]);
  }
  return null;
}

function extractNote(raw) {
  const match = raw.match(/nota\s+(?:llamada|que\s+se\s+llame)\s+(.+?)\s+(?:con\s+este\s+texto:?|que\s+diga|con\s+texto)\s+([\s\S]+)$/i);
  if (!match) return {};
  return { name: cleanEntity(match[1]), text: String(match[2] || "").trim() };
}

function extractSearch(raw) {
  const normalized = cleanText(raw);
  if (!/\b(buscar|encontrar|localizar)\b/.test(normalized)) return {};
  const entities = {};
  const limitMatch = normalized.match(/\blimite\s+(\d{1,3})\b/);
  if (limitMatch) entities.limit = Math.min(100, Math.max(1, Number(limitMatch[1])));

  const words = normalized.split(" ");
  for (const word of words) {
    if (EXTENSION_ALIASES[word]) Object.assign(entities, EXTENSION_ALIASES[word]);
  }

  const extensionMatch = normalized.match(/\b(pdf|txt|docx?|xlsx?|csv|png|jpe?g|gif|webp|zip)\b/);
  if (extensionMatch) entities.extension = extensionMatch[1] === "jpeg" ? "jpg" : extensionMatch[1];

  const termPatterns = [
    /(?:que\s+(?:contengan|tengan)|con|llamados?|sobre)\s+(.+?)(?:\s+limite\s+\d+)?$/i,
    /\b(?:pdf|txt|docx?|xlsx?|csv|png|jpe?g|gif|webp|zip)\s+de\s+(.+?)(?:\s+limite\s+\d+)?$/i,
    /(?:buscar|busca|buscame|encontrar|localizar)\s+(?:los?\s+|archivos?\s+|documentos?\s+|imagenes?\s+|fotos?\s+)*(?:pdf|txt|docx?|xlsx?|csv|png|jpe?g|gif|webp|zip)?\s*(?:de\s+)?(.+?)(?:\s+limite\s+\d+)?$/i
  ];
  for (const pattern of termPatterns) {
    const match = raw.match(pattern);
    const candidate = cleanEntity(match?.[1]);
    if (candidate && !isOnlySearchType(candidate)) {
      entities.searchTerm = candidate;
      break;
    }
  }
  return entities;
}

function extractNamedReference(raw, kind) {
  const match = raw.match(new RegExp(`${kind}(?:\\s+llamad[oa])?\\s+(.+)$`, "i"));
  return cleanEntity(match?.[1]);
}

function missingEntities(intent, entities) {
  const required = {
    open_app: [["app"]],
    create_folder: [["folderName"]],
    search_files: [["searchTerm"]],
    create_note: [["noteName"], ["noteText"]]
  }[intent] || [];
  return required.flat().filter((key) => !entities[key]);
}

function clarificationPrompt(intent, missing) {
  if (intent === "open_app") return "Que aplicacion queres abrir? Podes elegir Chrome, Bloc de notas o Explorador.";
  if (intent === "create_folder") return "Que nombre queres ponerle a la carpeta?";
  if (intent === "search_files") return "Que texto queres buscar en los nombres de archivo?";
  if (intent === "create_note" && missing.includes("noteName")) return "Que nombre queres ponerle a la nota?";
  if (intent === "create_note" && missing.includes("noteText")) return "Que texto queres guardar en la nota?";
  return "Necesito un dato mas para continuar.";
}

function resolveClarification(pending, answer) {
  const value = String(answer || "").trim();
  const entities = { ...(pending.entities || {}) };
  const missing = [...(pending.missing || [])];
  const key = missing[0];
  if (key === "app") entities.app = extractApp(cleanText(value));
  if (key === "folderName") entities.folderName = cleanEntity(value.replace(/^mejor\s+llamala\s+/i, ""));
  if (key === "searchTerm") entities.searchTerm = cleanEntity(value);
  if (key === "noteName") entities.noteName = cleanEntity(value);
  if (key === "noteText") entities.noteText = value;
  return {
    intent: pending.intent,
    entities,
    missing: missingEntities(pending.intent, entities),
    usedContext: ["clarification"],
    sanitized: sanitizeEntitiesForDebug(entities)
  };
}

function detectContextFollowUp(text, context) {
  const normalized = cleanText(text);
  if (!context) return null;
  const extensionMatch = normalized.match(/^(?:solamente|solo|unicamente)?\s*(?:los?\s+)?(pdf|txt|docx?|xlsx?|csv|png|jpe?g)$/);
  if (context.intent === "search_files" && extensionMatch) {
    return {
      intent: "search_files",
      entities: { ...(context.entities || {}), extension: extensionMatch[1] },
      usedContext: ["searchTerm", "previousCommand"]
    };
  }
  if (/^(?:guardalo|guardar eso)\s+como\s+favorito$/.test(normalized) && (context.storableCommand || context.originalText)) {
    return { type: "save_favorite", command: context.storableCommand || context.originalText, usedContext: ["previousCommand"] };
  }
  if (/^mejor\s+llamala\s+/.test(normalized) && context.executed) {
    return { type: "already_executed_correction", usedContext: ["previousCommand"] };
  }
  return null;
}

function sanitizeEntitiesForDebug(entities) {
  const result = {};
  for (const [key, value] of Object.entries(entities || {})) {
    if (value === null || value === undefined) continue;
    const text = String(value);
    result[key] = detectSensitiveText(text).sensitive || /[A-Za-z]:\\/.test(text) ? "[oculto]" : value;
  }
  return result;
}

function cleanEntity(value) {
  const result = String(value || "").trim().replace(/[.?!]+$/, "").trim();
  return result || null;
}

function isOnlySearchType(value) {
  return /^(?:archivos?|documentos?|imagenes?|fotos?|pdf|txt|docx?|xlsx?|csv|png|jpe?g|gif|webp|zip)$/i.test(value);
}

module.exports = {
  clarificationPrompt,
  detectContextFollowUp,
  extractEntities,
  missingEntities,
  resolveClarification,
  sanitizeEntitiesForDebug
};
