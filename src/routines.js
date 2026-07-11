const { normalize } = require("./commandParser");
const { DATA_FILES, DEFAULT_ROUTINES, readJson, sanitizeFileName, writeJson } = require("./fileManager");
const { validateStoredCommand } = require("./favorites");
const { detectSensitiveText } = require("./sensitiveText");

const MAX_ROUTINES = 30;
const MAX_STEPS = 10;

function getState() {
  const stored = readJson(DATA_FILES.routines, DEFAULT_ROUTINES);
  return {
    ...DEFAULT_ROUTINES,
    ...stored,
    items: Array.isArray(stored.items) ? stored.items : []
  };
}

function listRoutines() {
  return getState().items;
}

function findRoutine(reference) {
  const value = normalize(reference);
  return listRoutines().find((item) => item.id === reference || normalize(item.name) === value) || null;
}

function createRoutine({ name, commands }) {
  const finalName = validateName(name);
  const values = Array.isArray(commands) ? commands : [];
  if (!values.length || values.length > MAX_STEPS) {
    throw new Error(`Una rutina debe tener entre 1 y ${MAX_STEPS} acciones.`);
  }

  const state = getState();
  if (state.items.length >= MAX_ROUTINES) {
    throw new Error(`Solo se permiten ${MAX_ROUTINES} rutinas locales.`);
  }
  if (state.items.some((item) => normalize(item.name) === normalize(finalName))) {
    throw new Error("Ya existe una rutina con ese nombre.");
  }

  const steps = values.map((command, index) => {
    const validated = validateStoredCommand(command);
    return {
      order: index + 1,
      command: validated.command,
      actionType: validated.action.type
    };
  });
  const timestamp = new Date().toISOString();
  const routine = {
    id: createId("routine"),
    name: finalName,
    steps,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  state.items.push(routine);
  state.updatedAt = timestamp;
  writeJson(DATA_FILES.routines, state);
  return routine;
}

function deleteRoutine(reference) {
  const routine = findRoutine(reference);
  if (!routine) throw new Error("No encontre esa rutina.");

  const state = getState();
  state.items = state.items.filter((item) => item.id !== routine.id);
  state.updatedAt = new Date().toISOString();
  writeJson(DATA_FILES.routines, state);
  return routine;
}

function validateName(name) {
  const value = String(name || "").trim();
  if (!value || value.length > 60) throw new Error("El nombre debe tener entre 1 y 60 caracteres.");
  if (detectSensitiveText(value).sensitive) throw new Error("El nombre parece contener informacion sensible.");
  const sanitized = sanitizeFileName(value, "rutina");
  if (sanitized !== value) throw new Error("El nombre contiene caracteres no permitidos.");
  return value;
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

module.exports = {
  createRoutine,
  deleteRoutine,
  findRoutine,
  getState,
  listRoutines
};
