const fs = require("fs");
const crypto = require("crypto");

const { DATA_FILES, DEFAULT_USER_PROFILE, dataPath, readJson, writeJson, writeJsonFile } = require("./fileManager");
const { cleanText, tokenize } = require("./localAI");
const { detectSensitiveText } = require("./sensitiveText");

const MAX_MEMORY_LENGTH = 500;
const SEARCH_LIMIT = 8;
const MIN_RELEVANCE = 0.18;

function loadProfile(options = {}) {
  const profile = readProfile(options);
  return normalizeProfile(profile);
}

function updateProfile(updates = {}, options = {}) {
  const profile = loadProfile(options);
  const now = new Date().toISOString();
  const next = normalizeProfile({
    ...profile,
    ...safeProfileUpdates(updates),
    updatedAt: now,
    createdAt: profile.createdAt || now
  });

  writeProfile(next, options);
  return next;
}

function saveMemory(text, options = {}) {
  const value = validateMemoryText(text);
  const sensitivity = detectSensitiveText(value);
  if (sensitivity.sensitive) {
    const error = new Error("No guardo recuerdos con datos sensibles.");
    error.code = "SENSITIVE_MEMORY";
    error.findings = sensitivity.findings;
    throw error;
  }

  const profile = loadProfile(options);
  const normalized = cleanText(value);
  const existing = profile.memories.find((memory) => cleanText(memory.text) === normalized);
  const now = new Date().toISOString();

  if (existing) {
    existing.updatedAt = now;
    const updatedProfile = applyProfileHints(profile, value, now);
    writeProfile(updatedProfile, options);
    return {
      added: false,
      memory: existing,
      profile: updatedProfile
    };
  }

  const memory = {
    id: createMemoryId(value, now),
    text: value,
    tags: inferTags(value),
    source: "user",
    createdAt: now,
    updatedAt: now
  };

  profile.memories.push(memory);
  const updatedProfile = applyProfileHints(profile, value, now);
  updatedProfile.updatedAt = now;
  updatedProfile.createdAt = updatedProfile.createdAt || now;
  writeProfile(updatedProfile, options);

  return {
    added: true,
    memory,
    profile: updatedProfile
  };
}

function deleteMemory(identifier, options = {}) {
  const query = String(identifier || "").trim();
  if (!query) {
    throw new Error("Falta indicar que recuerdo queres borrar.");
  }

  const profile = loadProfile(options);
  const matches = findMemoryMatches(profile.memories, query);

  if (!matches.length) {
    return {
      deleted: [],
      profile
    };
  }

  const idsToDelete = new Set(matches.map((match) => match.memory.id));
  const deleted = profile.memories.filter((memory) => idsToDelete.has(memory.id));
  profile.memories = profile.memories.filter((memory) => !idsToDelete.has(memory.id));
  profile.updatedAt = new Date().toISOString();
  writeProfile(profile, options);

  return {
    deleted,
    profile
  };
}

function updateMemory(id, text, options = {}) {
  const memoryId = String(id || "").trim();
  if (!memoryId) {
    throw new Error("Falta el ID del recuerdo.");
  }

  const value = validateMemoryText(text);
  const sensitivity = detectSensitiveText(value);
  if (sensitivity.sensitive) {
    const error = new Error("No guardo recuerdos con datos sensibles.");
    error.code = "SENSITIVE_MEMORY";
    error.findings = sensitivity.findings;
    throw error;
  }

  const profile = loadProfile(options);
  const memory = profile.memories.find((item) => item.id === memoryId);
  if (!memory) {
    throw new Error("No encontre el recuerdo solicitado.");
  }

  memory.text = value;
  memory.tags = inferTags(value);
  memory.updatedAt = new Date().toISOString();
  const updatedProfile = applyProfileHints(profile, value, memory.updatedAt);
  writeProfile(updatedProfile, options);

  return {
    memory,
    profile: updatedProfile
  };
}

function searchMemory(query, options = {}) {
  const profile = loadProfile(options);
  const value = String(query || "").trim();
  if (!value) {
    return [];
  }

  const profileDocs = profileToSearchDocs(profile);
  const memoryDocs = profile.memories.map((memory) => ({
    type: "memory",
    id: memory.id,
    text: memory.text,
    memory,
    tokens: tokensForMemory(memory)
  }));

  return [...memoryDocs, ...profileDocs]
    .map((doc) => ({
      ...doc,
      score: scoreText(value, doc.tokens)
    }))
    .filter((result) => result.score >= (options.minScore || MIN_RELEVANCE))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit || SEARCH_LIMIT)
    .map((result) => ({
      type: result.type,
      id: result.id,
      text: result.text,
      score: result.score,
      memory: result.memory || null
    }));
}

function getRelevantMemories(text, options = {}) {
  return searchMemory(text, {
    ...options,
    limit: options.limit || 5,
    minScore: options.minScore || MIN_RELEVANCE
  });
}

function listMemories(options = {}) {
  return loadProfile(options).memories;
}

function getMemoryState(options = {}) {
  const profile = loadProfile(options);
  return {
    profile: publicProfile(profile),
    memories: profile.memories,
    stats: {
      memoryCount: profile.memories.length,
      favoriteFolderCount: profile.favoriteFolders.length,
      updatedAt: profile.updatedAt,
      createdAt: profile.createdAt
    }
  };
}

function parseMemoryRequest(text) {
  const value = String(text || "").trim();
  const normalized = cleanText(value);

  const rememberMatch = value.match(/^\s*(recorda|recordá|recordar|recuerda)\s+(?:que\s+)?(.+)$/i);
  if (rememberMatch) {
    return { type: "remember", text: rememberMatch[2].trim() };
  }

  const forgetMatch = value.match(/^\s*(olvida|olvidá|olvidar|borra\s+recuerdo|borrar\s+recuerdo)\s+(.+)$/i);
  if (forgetMatch) {
    return { type: "forget", query: forgetMatch[2].trim() };
  }

  const searchMatch = value.match(/^\s*(buscar\s+recuerdos?|busca\s+recuerdos?)\s*(?:sobre|de|que\s+contengan)?\s*(.*)$/i);
  if (searchMatch) {
    return { type: "search", query: searchMatch[2].trim() };
  }

  if (
    normalized === "mostrar recuerdos" ||
    normalized === "mis recuerdos" ||
    normalized.includes("que recordas de mi") ||
    normalized.includes("que sabes de mi") ||
    normalized.includes("que tenes guardado de mi")
  ) {
    return { type: "summary" };
  }

  if (isProfileQuestion(normalized)) {
    return { type: "profile_question", query: value };
  }

  if (isShortTermReference(normalized)) {
    return { type: "short_reference", query: value };
  }

  return null;
}

function answerMemoryRequest(request, options = {}) {
  if (!request) return null;

  if (request.type === "remember") {
    const result = saveMemory(request.text, options);
    return {
      action: "memory.remember",
      reply: result.added
        ? `Listo. Guarde este recuerdo: "${result.memory.text}".`
        : `Ya tenia guardado ese recuerdo: "${result.memory.text}".`,
      result
    };
  }

  if (request.type === "forget") {
    const result = deleteMemory(request.query, options);
    const reply = result.deleted.length
      ? `Olvide ${result.deleted.length} recuerdo${result.deleted.length === 1 ? "" : "s"}.`
      : "No encontre un recuerdo local que coincida con eso.";
    return {
      action: "memory.forget",
      reply,
      result
    };
  }

  if (request.type === "search") {
    const results = request.query ? searchMemory(request.query, options) : [];
    return {
      action: "memory.search",
      reply: formatSearchResults(results, request.query),
      result: { results }
    };
  }

  if (request.type === "summary") {
    const state = getMemoryState(options);
    return {
      action: "memory.summary",
      reply: formatMemorySummary(state),
      result: state
    };
  }

  if (request.type === "profile_question") {
    const profile = loadProfile(options);
    return {
      action: "memory.profile_question",
      reply: answerProfileQuestion(request.query, profile),
      result: { profile: publicProfile(profile) }
    };
  }

  if (request.type === "short_reference") {
    return {
      action: "memory.short_reference",
      reply: resolveShortTermReference(request.query, options.history || []),
      result: {}
    };
  }

  return null;
}

function resolveShortTermReference(text, history = []) {
  const previous = (Array.isArray(history) ? history : [])
    .filter((message) => message.role === "user")
    .slice(0, -1)
    .reverse();
  const normalized = cleanText(text);

  if (normalized.includes("eso") || normalized.includes("recien") || normalized.includes("recién")) {
    const last = previous[0];
    return last
      ? `Lo ultimo que me dijiste fue: "${last.content}".`
      : "No tengo un mensaje anterior claro en esta conversacion.";
  }

  if (normalized.includes("carpeta")) {
    const folderMessage = previous.find((message) => cleanText(message.content).includes("carpeta"));
    const folder = folderMessage?.content?.match(/carpeta\s+(?:llamada\s+)?(.+?)(?:\s+en\s+|$)/i)?.[1]?.trim();
    return folder
      ? `La carpeta anterior que mencionaste fue: "${folder}".`
      : "No encontre una carpeta anterior clara en esta conversacion.";
  }

  if (normalized.includes("archivo") || normalized.includes("buscamos")) {
    const searchMessage = previous.find((message) => cleanText(message.content).includes("buscar archivos"));
    return searchMessage
      ? `Lo ultimo que buscamos fue: "${searchMessage.content}".`
      : "No encontre una busqueda de archivos anterior clara.";
  }

  return "No encontre una referencia clara en el contexto corto.";
}

function formatSearchResults(results, query) {
  if (!query) {
    return "Decime que queres buscar en tus recuerdos.";
  }

  if (!results.length) {
    return `No encontre recuerdos sobre "${query}".`;
  }

  const lines = results.slice(0, 5).map((result) => `- ${result.text}`);
  return `Encontre esto en tu memoria local:\n${lines.join("\n")}`;
}

function formatMemorySummary(state) {
  const profile = state.profile;
  const lines = [];

  if (profile.preferredBrowser) lines.push(`- Navegador preferido: ${profile.preferredBrowser}`);
  if (profile.preferredTheme) lines.push(`- Tema preferido: ${profile.preferredTheme}`);
  if (profile.favoriteFolders.length) lines.push(`- Carpetas favoritas: ${profile.favoriteFolders.join(", ")}`);

  const memories = state.memories.slice(-5).map((memory) => `- ${memory.text}`);
  if (memories.length) {
    lines.push("- Recuerdos guardados:");
    lines.push(...memories);
  }

  return lines.length
    ? `Esto recuerdo de vos, guardado solo en esta PC:\n${lines.join("\n")}`
    : "Todavia no tengo recuerdos guardados sobre vos.";
}

function answerProfileQuestion(query, profile) {
  const normalized = cleanText(query);

  if (normalized.includes("navegador")) {
    return profile.preferredBrowser
      ? `Tu navegador preferido es ${profile.preferredBrowser}.`
      : "Todavia no tengo guardado tu navegador preferido.";
  }

  if (normalized.includes("tema") || normalized.includes("oscuro")) {
    return profile.preferredTheme
      ? `Tu tema preferido es ${profile.preferredTheme}.`
      : "Todavia no tengo guardado tu tema preferido.";
  }

  if (normalized.includes("carpeta")) {
    return profile.favoriteFolders.length
      ? `Tus carpetas favoritas guardadas son: ${profile.favoriteFolders.join(", ")}.`
      : "Todavia no tengo guardadas carpetas favoritas.";
  }

  const results = searchMemory(query, { minScore: 0.12, limit: 3 });
  if (results.length) {
    return `Esto encontre en tu memoria local:\n${results.map((result) => `- ${result.text}`).join("\n")}`;
  }

  return "Todavia no tengo un dato guardado para responder eso.";
}

function isProfileQuestion(normalized) {
  return (
    normalized.includes("cual es mi navegador") ||
    normalized.includes("que navegador uso") ||
    normalized.includes("mi navegador favorito") ||
    normalized.includes("cual es mi tema") ||
    normalized.includes("que tema prefiero") ||
    normalized.includes("cual es mi carpeta") ||
    normalized.includes("que carpeta uso")
  );
}

function isShortTermReference(normalized) {
  return (
    normalized.includes("eso que te dije") ||
    normalized.includes("te dije recien") ||
    normalized.includes("dije recien") ||
    normalized.includes("carpeta anterior") ||
    normalized.includes("archivo que buscamos")
  );
}

function applyProfileHints(profile, text, timestamp) {
  const normalized = cleanText(text);
  const next = normalizeProfile(profile);

  const browser = detectBrowser(normalized);
  if (browser) next.preferredBrowser = browser;

  const theme = detectTheme(normalized);
  if (theme) next.preferredTheme = theme;

  const folder = detectFolder(text);
  if (folder && !next.favoriteFolders.some((item) => cleanText(item) === cleanText(folder))) {
    next.favoriteFolders.push(folder);
    next.customPreferences.mainFolder = next.customPreferences.mainFolder || folder;
  }

  if (normalized.includes("prefiero")) {
    next.customPreferences.lastPreference = text.trim();
  }

  next.updatedAt = timestamp || new Date().toISOString();
  next.createdAt = next.createdAt || next.updatedAt;
  return next;
}

function detectBrowser(normalized) {
  if (normalized.includes("chrome")) return "Chrome";
  if (normalized.includes("firefox")) return "Firefox";
  if (normalized.includes("edge")) return "Edge";
  if (normalized.includes("brave")) return "Brave";
  if (normalized.includes("opera")) return "Opera";
  return null;
}

function detectTheme(normalized) {
  if (normalized.includes("modo oscuro") || normalized.includes("tema oscuro") || normalized.includes("dark")) return "Dark";
  if (normalized.includes("modo claro") || normalized.includes("tema claro") || normalized.includes("light")) return "Light";
  return null;
}

function detectFolder(text) {
  const value = String(text || "").trim();
  const match = value.match(/(?:carpeta|folder)\s+(?:principal|favorita|preferida)?\s*(?:es|:)?\s+(.+)$/i);
  if (!match) return null;
  return match[1].replace(/[.。]+$/g, "").trim().slice(0, 120);
}

function inferTags(text) {
  const normalized = cleanText(text);
  const tags = new Set(tokenize(text));

  if (detectBrowser(normalized)) {
    tags.add("navegador");
    tags.add("browser");
  }

  if (detectTheme(normalized)) {
    tags.add("tema");
    tags.add("apariencia");
  }

  if (normalized.includes("carpeta") || normalized.includes("descargas") || normalized.includes("documentos")) {
    tags.add("carpeta");
    tags.add("folder");
    tags.add("archivos");
  }

  return Array.from(tags).slice(0, 20);
}

function profileToSearchDocs(profile) {
  const docs = [];
  if (profile.preferredBrowser) {
    docs.push({
      type: "profile",
      id: "preferredBrowser",
      text: `Navegador preferido: ${profile.preferredBrowser}`,
      tokens: tokenize(`navegador browser uso favorito preferido ${profile.preferredBrowser}`)
    });
  }

  if (profile.preferredTheme) {
    docs.push({
      type: "profile",
      id: "preferredTheme",
      text: `Tema preferido: ${profile.preferredTheme}`,
      tokens: tokenize(`tema apariencia modo favorito preferido ${profile.preferredTheme}`)
    });
  }

  for (const folder of profile.favoriteFolders) {
    docs.push({
      type: "profile",
      id: `folder:${cleanText(folder)}`,
      text: `Carpeta favorita: ${folder}`,
      tokens: tokenize(`carpeta folder archivos favorito principal ${folder}`)
    });
  }

  return docs;
}

function tokensForMemory(memory) {
  return tokenize(`${memory.text} ${(memory.tags || []).join(" ")}`);
}

function scoreText(query, targetTokens) {
  const queryTokens = tokenize(expandQuery(query));
  const target = new Set(targetTokens || []);
  if (!queryTokens.length || !target.size) return 0;

  let matches = 0;
  for (const token of new Set(queryTokens)) {
    if (target.has(token)) matches += 1;
  }

  const overlap = matches / Math.max(1, new Set(queryTokens).size);
  const coverage = matches / Math.max(1, target.size);
  return round(overlap * 0.72 + coverage * 0.28);
}

function expandQuery(query) {
  const normalized = cleanText(query);
  const extras = [];
  if (normalized.includes("navegador")) extras.push("browser uso favorito preferido");
  if (normalized.includes("tema")) extras.push("modo apariencia favorito preferido");
  if (normalized.includes("carpeta")) extras.push("folder archivos principal favorito");
  return `${query} ${extras.join(" ")}`;
}

function findMemoryMatches(memories, query) {
  const normalizedQuery = cleanText(query);
  const direct = memories.filter((memory) => {
    return memory.id === query || cleanText(memory.text).includes(normalizedQuery);
  });

  if (direct.length) {
    return direct.map((memory) => ({ memory, score: 1 }));
  }

  return memories
    .map((memory) => ({
      memory,
      score: scoreText(query, tokensForMemory(memory))
    }))
    .filter((match) => match.score >= 0.28)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function safeProfileUpdates(updates) {
  const allowed = {};
  if (Object.hasOwn(updates, "preferredBrowser")) {
    allowed.preferredBrowser = nullableString(updates.preferredBrowser, 80);
  }
  if (Object.hasOwn(updates, "preferredTheme")) {
    allowed.preferredTheme = nullableString(updates.preferredTheme, 40);
  }
  if (Array.isArray(updates.favoriteFolders)) {
    allowed.favoriteFolders = updates.favoriteFolders.map((folder) => String(folder).trim()).filter(Boolean).slice(0, 20);
  }
  if (updates.customPreferences && typeof updates.customPreferences === "object" && !Array.isArray(updates.customPreferences)) {
    allowed.customPreferences = Object.fromEntries(
      Object.entries(updates.customPreferences)
        .filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        .slice(0, 40)
    );
  }
  return allowed;
}

function publicProfile(profile) {
  return {
    preferredBrowser: profile.preferredBrowser,
    preferredTheme: profile.preferredTheme,
    favoriteFolders: profile.favoriteFolders,
    customPreferences: profile.customPreferences,
    updatedAt: profile.updatedAt,
    createdAt: profile.createdAt
  };
}

function normalizeProfile(profile) {
  return {
    ...DEFAULT_USER_PROFILE,
    ...(profile || {}),
    favoriteFolders: Array.isArray(profile?.favoriteFolders) ? profile.favoriteFolders : [],
    customPreferences: isPlainObject(profile?.customPreferences) ? profile.customPreferences : {},
    memories: Array.isArray(profile?.memories) ? profile.memories.map(normalizeMemory).filter(Boolean) : []
  };
}

function normalizeMemory(memory) {
  if (!memory || typeof memory.text !== "string") return null;
  const createdAt = memory.createdAt || new Date().toISOString();
  return {
    id: memory.id || createMemoryId(memory.text, createdAt),
    text: memory.text,
    tags: Array.isArray(memory.tags) ? memory.tags : inferTags(memory.text),
    source: memory.source || "user",
    createdAt,
    updatedAt: memory.updatedAt || createdAt
  };
}

function readProfile(options = {}) {
  if (options.profilePath) {
    if (!fs.existsSync(options.profilePath)) return structuredCloneSafe(DEFAULT_USER_PROFILE);
    try {
      return JSON.parse(fs.readFileSync(options.profilePath, "utf8"));
    } catch {
      return structuredCloneSafe(DEFAULT_USER_PROFILE);
    }
  }

  return readJson(DATA_FILES.userProfile, DEFAULT_USER_PROFILE);
}

function writeProfile(profile, options = {}) {
  if (options.profilePath) {
    writeJsonFile(options.profilePath, profile);
    return;
  }

  writeJson(DATA_FILES.userProfile, profile);
}

function validateMemoryText(text) {
  const value = String(text || "").trim();
  if (!value) {
    throw new Error("El recuerdo no puede estar vacio.");
  }
  if (value.length > MAX_MEMORY_LENGTH) {
    throw new Error("El recuerdo es demasiado largo.");
  }
  return value;
}

function nullableString(value, limit) {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim().slice(0, limit);
}

function createMemoryId(text, salt = "") {
  return crypto
    .createHash("sha256")
    .update(`${cleanText(text)}\0${salt}`)
    .digest("hex")
    .slice(0, 16);
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

module.exports = {
  answerMemoryRequest,
  deleteMemory,
  getMemoryState,
  getRelevantMemories,
  listMemories,
  loadProfile,
  parseMemoryRequest,
  saveMemory,
  searchMemory,
  updateMemory,
  updateProfile
};
