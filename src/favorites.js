const { parseCommand, normalize } = require("./commandParser");
const { DATA_FILES, DEFAULT_FAVORITES, readJson, sanitizeFileName, writeJson } = require("./fileManager");
const safety = require("./safety");
const { detectSensitiveText } = require("./sensitiveText");

const MAX_FAVORITES = 50;
const MAX_COMMAND_LENGTH = 500;

function getState() {
  const stored = readJson(DATA_FILES.favorites, DEFAULT_FAVORITES);
  return {
    ...DEFAULT_FAVORITES,
    ...stored,
    items: Array.isArray(stored.items) ? stored.items : []
  };
}

function listFavorites() {
  return getState().items;
}

function findFavorite(reference) {
  const value = normalize(reference);
  return listFavorites().find((item) => item.id === reference || normalize(item.name) === value) || null;
}

function createFavorite({ name, command }) {
  const validated = validateStoredCommand(command);
  const state = getState();
  if (state.items.length >= MAX_FAVORITES) {
    throw new Error(`Solo se permiten ${MAX_FAVORITES} favoritos locales.`);
  }

  const finalName = validateName(name || suggestedName(validated.action, validated.command));
  if (state.items.some((item) => normalize(item.name) === normalize(finalName))) {
    throw new Error("Ya existe un favorito con ese nombre.");
  }

  const timestamp = new Date().toISOString();
  const favorite = {
    id: createId("fav"),
    name: finalName,
    command: validated.command,
    actionType: validated.action.type,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  state.items.push(favorite);
  state.updatedAt = timestamp;
  writeJson(DATA_FILES.favorites, state);
  return favorite;
}

function deleteFavorite(reference) {
  const favorite = findFavorite(reference);
  if (!favorite) throw new Error("No encontre ese favorito.");

  const state = getState();
  state.items = state.items.filter((item) => item.id !== favorite.id);
  state.updatedAt = new Date().toISOString();
  writeJson(DATA_FILES.favorites, state);
  return favorite;
}

function validateStoredCommand(command) {
  const value = String(command || "").trim();
  if (!value) throw new Error("El comando no puede estar vacio.");
  if (value.length > MAX_COMMAND_LENGTH) throw new Error("El comando es demasiado largo.");

  const incomingSafety = safety.validateIncomingText(value);
  if (!incomingSafety.ok) throw new Error(incomingSafety.reason);
  if (detectSensitiveText(value).sensitive) {
    throw new Error("No se pueden guardar comandos con informacion sensible.");
  }

  const action = parseCommand(value);
  if (action.type === "unknown") {
    throw new Error("Solo se pueden guardar comandos exactos incluidos en la allowlist.");
  }

  const actionSafety = safety.validateAction(action);
  if (!actionSafety.ok) throw new Error(actionSafety.reason);
  return { action, command: value };
}

function validateName(name) {
  const value = String(name || "").trim();
  if (!value || value.length > 60) throw new Error("El nombre debe tener entre 1 y 60 caracteres.");
  if (detectSensitiveText(value).sensitive) throw new Error("El nombre parece contener informacion sensible.");
  const sanitized = sanitizeFileName(value, "favorito");
  if (sanitized !== value) throw new Error("El nombre contiene caracteres no permitidos.");
  return value;
}

function suggestedName(action, command) {
  if (action.type === "open_app") return action.payload.app;
  if (action.type === "list_downloads") return "listar descargas";
  if (action.type === "system_status") return "estado del sistema";
  if (action.type === "create_desktop_folder") return `carpeta ${action.payload.name}`;
  if (action.type === "create_note") return `nota ${action.payload.name}`;
  if (action.type === "find_files") return `buscar ${action.payload.term}`;
  if (action.type === "organize_downloads") return "organizar descargas";
  return command.slice(0, 60);
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

module.exports = {
  createFavorite,
  deleteFavorite,
  findFavorite,
  getState,
  listFavorites,
  validateStoredCommand
};
