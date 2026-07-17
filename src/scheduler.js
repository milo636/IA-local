const { normalize } = require("./commandParser");
const { validateStoredCommand } = require("./favorites");
const {
  DATA_FILES,
  DEFAULT_SCHEDULED_TASKS,
  readJson,
  sanitizeFileName,
  writeJson
} = require("./fileManager");
const logger = require("./logger");
const permissions = require("./permissions");
const { detectSensitiveText } = require("./sensitiveText");

const MAX_SCHEDULED_TASKS = 50;
const MAX_FUTURE_DAYS = 366;
const AUTO_ACTION_TYPES = new Set(["help", "list_downloads", "find_files", "system_status"]);
const REPEAT_INTERVALS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000
};

let intervalHandle = null;
let initialHandle = null;
let processing = false;

function getState() {
  const stored = readJson(DATA_FILES.scheduledTasks, DEFAULT_SCHEDULED_TASKS);
  return {
    ...DEFAULT_SCHEDULED_TASKS,
    ...stored,
    items: Array.isArray(stored.items) ? stored.items.map(normalizeTask).filter(Boolean) : []
  };
}

function listScheduledTasks(options = {}) {
  const now = toTimestamp(options.now ?? Date.now());
  return getState().items
    .map((task) => taskView(task, now))
    .sort((left, right) => statusOrder(left.status) - statusOrder(right.status)
      || String(left.nextRunAt || "9999").localeCompare(String(right.nextRunAt || "9999")));
}

function findScheduledTask(reference, options = {}) {
  const state = getState();
  const task = findRawTask(state, reference);
  return task ? taskView(task, toTimestamp(options.now ?? Date.now())) : null;
}

function createScheduledTask(input, options = {}) {
  const now = toTimestamp(options.now ?? Date.now());
  const state = getState();
  if (state.items.length >= MAX_SCHEDULED_TASKS) {
    throw new Error(`Solo se permiten ${MAX_SCHEDULED_TASKS} tareas programadas locales.`);
  }

  const validated = validateTaskInput(input, now);
  if (state.items.some((task) => normalize(task.name) === normalize(validated.name))) {
    throw new Error("Ya existe una tarea programada con ese nombre.");
  }

  const timestamp = new Date(now).toISOString();
  const task = {
    id: createId("schedule"),
    name: validated.name,
    command: validated.command,
    actionType: validated.actionType,
    runAt: validated.runAt,
    nextRunAt: validated.runAt,
    repeat: validated.repeat,
    autoRun: validated.autoRun,
    enabled: true,
    lastRunAt: null,
    lastOutcome: null,
    runCount: 0,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  state.items.push(task);
  state.updatedAt = timestamp;
  writeJson(DATA_FILES.scheduledTasks, state);
  return taskView(task, now);
}

function updateScheduledTask(reference, patch, options = {}) {
  const now = toTimestamp(options.now ?? Date.now());
  const state = getState();
  const task = findRawTask(state, reference);
  if (!task) throw new Error("No encontre esa tarea programada.");

  const next = { ...task };
  if (Object.prototype.hasOwnProperty.call(patch, "name")) next.name = validateName(patch.name);
  if (Object.prototype.hasOwnProperty.call(patch, "command")) {
    const validated = validateStoredCommand(patch.command);
    next.command = validated.command;
    next.actionType = validated.action.type;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "repeat")) next.repeat = validateRepeat(patch.repeat);
  if (Object.prototype.hasOwnProperty.call(patch, "autoRun")) {
    if (typeof patch.autoRun !== "boolean") {
      throw new Error("La ejecucion automatica debe ser verdadera o falsa.");
    }
    next.autoRun = patch.autoRun;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "enabled")) {
    if (typeof patch.enabled !== "boolean") throw new Error("El estado de la tarea debe ser verdadero o falso.");
    next.enabled = patch.enabled;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "runAt")) {
    next.runAt = validateRunAt(patch.runAt, now);
    next.nextRunAt = next.runAt;
    next.completedAt = null;
    next.lastOutcome = null;
  }

  if (next.autoRun && !isAutomaticAction(next.actionType)) {
    throw new Error("La ejecucion automatica solo admite acciones de lectura local.");
  }
  if (next.enabled && !next.nextRunAt) {
    throw new Error("Reprograma la fecha antes de activar una tarea completada.");
  }
  if (state.items.some((item) => item.id !== task.id && normalize(item.name) === normalize(next.name))) {
    throw new Error("Ya existe una tarea programada con ese nombre.");
  }

  Object.assign(task, next, { updatedAt: new Date(now).toISOString() });
  state.updatedAt = task.updatedAt;
  writeJson(DATA_FILES.scheduledTasks, state);
  return taskView(task, now);
}

function deleteScheduledTask(reference) {
  const state = getState();
  const task = findRawTask(state, reference);
  if (!task) throw new Error("No encontre esa tarea programada.");
  state.items = state.items.filter((item) => item.id !== task.id);
  state.updatedAt = new Date().toISOString();
  writeJson(DATA_FILES.scheduledTasks, state);
  return taskView(task, Date.now());
}

function recordTaskRun(reference, outcome = "completed", options = {}) {
  const now = toTimestamp(options.now ?? Date.now());
  const state = getState();
  const task = findRawTask(state, reference);
  if (!task) throw new Error("No encontre esa tarea programada.");

  const timestamp = new Date(now).toISOString();
  task.lastRunAt = timestamp;
  task.lastOutcome = normalizeOutcome(outcome);
  task.runCount = Number(task.runCount || 0) + 1;
  task.updatedAt = timestamp;

  if (task.repeat === "none") {
    task.enabled = false;
    task.nextRunAt = null;
    task.completedAt = task.lastOutcome === "completed" ? timestamp : null;
  } else {
    task.nextRunAt = nextOccurrence(task.nextRunAt || task.runAt, task.repeat, now);
    task.enabled = true;
    task.completedAt = null;
  }

  state.updatedAt = timestamp;
  writeJson(DATA_FILES.scheduledTasks, state);
  return taskView(task, now);
}

function getDueAutomaticTasks(options = {}) {
  const now = toTimestamp(options.now ?? Date.now());
  return listScheduledTasks({ now })
    .filter((task) => task.status === "due" && task.autoRun && isAutomaticAction(task.actionType))
    .slice(0, 5);
}

async function processDueTasks({ execute, now = Date.now() } = {}) {
  if (processing) return { processed: 0, skipped: "busy" };
  if (typeof execute !== "function") throw new Error("Falta el ejecutor seguro de tareas.");
  if (!permissions.getSettings().allowScheduledActions) return { processed: 0, skipped: "permission" };

  processing = true;
  let processed = 0;
  let failed = 0;
  try {
    const due = getDueAutomaticTasks({ now });
    for (const task of due) {
      try {
        const validated = validateStoredCommand(task.command);
        if (!isAutomaticAction(validated.action.type)) {
          throw new Error("La accion ya no es apta para ejecucion automatica.");
        }
        await execute(task);
        recordTaskRun(task.id, "completed", { now: Date.now() });
        logger.writeLog({
          level: "info",
          action: "schedule.auto.completed",
          message: "Tarea local de solo lectura ejecutada automaticamente",
          details: { taskId: task.id, actionType: task.actionType }
        });
        processed += 1;
      } catch (error) {
        recordTaskRun(task.id, "failed", { now: Date.now() });
        logger.writeLog({
          level: "error",
          action: "schedule.auto.failed",
          message: "La tarea automatica fue detenida",
          details: { taskId: task.id, error: error.message }
        });
        failed += 1;
      }
    }
    return { processed, failed };
  } finally {
    processing = false;
  }
}

function startScheduler({ execute, intervalMs = 30000 } = {}) {
  if (typeof execute !== "function") throw new Error("Falta el ejecutor seguro de tareas.");
  stopScheduler();
  const tick = () => processDueTasks({ execute }).catch((error) => {
    logger.writeLog({
      level: "error",
      action: "schedule.tick.failed",
      message: "No se pudo revisar la agenda local",
      details: { error: error.message }
    });
  });
  initialHandle = setTimeout(tick, 1000);
  intervalHandle = setInterval(tick, Math.max(10000, Number(intervalMs) || 30000));
  initialHandle.unref?.();
  intervalHandle.unref?.();
}

function stopScheduler() {
  if (initialHandle) clearTimeout(initialHandle);
  if (intervalHandle) clearInterval(intervalHandle);
  initialHandle = null;
  intervalHandle = null;
}

function validateTaskInput(input, now) {
  const validated = validateStoredCommand(input.command);
  const autoRun = Boolean(input.autoRun);
  if (autoRun && !isAutomaticAction(validated.action.type)) {
    throw new Error("La ejecucion automatica solo admite acciones de lectura local.");
  }
  return {
    name: validateName(input.name),
    command: validated.command,
    actionType: validated.action.type,
    runAt: validateRunAt(input.runAt, now),
    repeat: validateRepeat(input.repeat),
    autoRun
  };
}

function validateName(name) {
  const value = String(name || "").trim();
  if (!value || value.length > 60) throw new Error("El nombre debe tener entre 1 y 60 caracteres.");
  if (detectSensitiveText(value).sensitive) throw new Error("El nombre parece contener informacion sensible.");
  if (sanitizeFileName(value, "tarea") !== value) throw new Error("El nombre contiene caracteres no permitidos.");
  return value;
}

function validateRunAt(value, now) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) throw new Error("La fecha programada no es valida.");
  if (timestamp < now - 60000) throw new Error("La fecha programada debe estar en el presente o futuro.");
  if (timestamp > now + MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000) {
    throw new Error(`La fecha no puede superar ${MAX_FUTURE_DAYS} dias.`);
  }
  return new Date(timestamp).toISOString();
}

function validateRepeat(value) {
  const repeat = String(value || "none").trim().toLowerCase();
  if (!new Set(["none", "daily", "weekly"]).has(repeat)) {
    throw new Error("La repeticion debe ser unica, diaria o semanal.");
  }
  return repeat;
}

function normalizeTask(value) {
  if (!value || typeof value !== "object" || !value.id || !value.command) return null;
  return {
    id: String(value.id),
    name: String(value.name || "Tarea local"),
    command: String(value.command),
    actionType: String(value.actionType || "unknown"),
    runAt: value.runAt || value.nextRunAt || null,
    nextRunAt: value.nextRunAt || null,
    repeat: ["none", "daily", "weekly"].includes(value.repeat) ? value.repeat : "none",
    autoRun: Boolean(value.autoRun),
    enabled: value.enabled !== false,
    lastRunAt: value.lastRunAt || null,
    lastOutcome: value.lastOutcome || null,
    runCount: Number(value.runCount || 0),
    completedAt: value.completedAt || null,
    createdAt: value.createdAt || new Date().toISOString(),
    updatedAt: value.updatedAt || value.createdAt || new Date().toISOString()
  };
}

function taskView(task, now) {
  return { ...task, status: taskStatus(task, now), automaticEligible: isAutomaticAction(task.actionType) };
}

function taskStatus(task, now) {
  if (!task.nextRunAt && task.lastOutcome === "awaiting_confirmation") return "awaiting_confirmation";
  if (!task.nextRunAt && task.lastOutcome === "failed") return "failed";
  if (!task.enabled && task.completedAt) return "completed";
  if (!task.enabled) return "paused";
  if (task.nextRunAt && Date.parse(task.nextRunAt) <= now) return "due";
  return "scheduled";
}

function nextOccurrence(baseValue, repeat, now) {
  const interval = REPEAT_INTERVALS[repeat];
  if (!interval) return null;
  let next = Date.parse(baseValue);
  if (!Number.isFinite(next)) next = now;
  do next += interval;
  while (next <= now);
  return new Date(next).toISOString();
}

function findRawTask(state, reference) {
  const value = normalize(reference);
  return state.items.find((task) => task.id === reference || normalize(task.name) === value) || null;
}

function isAutomaticAction(actionType) {
  return AUTO_ACTION_TYPES.has(actionType);
}

function normalizeOutcome(outcome) {
  const value = String(outcome || "completed");
  return ["completed", "awaiting_confirmation", "failed"].includes(value) ? value : "failed";
}

function statusOrder(status) {
  return { due: 0, awaiting_confirmation: 1, scheduled: 2, failed: 3, paused: 4, completed: 5 }[status] ?? 9;
}

function toTimestamp(value) {
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp)) throw new Error("La fecha interna de la agenda no es valida.");
  return timestamp;
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

module.exports = {
  AUTO_ACTION_TYPES,
  MAX_SCHEDULED_TASKS,
  createScheduledTask,
  deleteScheduledTask,
  findScheduledTask,
  getDueAutomaticTasks,
  getState,
  isAutomaticAction,
  listScheduledTasks,
  processDueTasks,
  recordTaskRun,
  startScheduler,
  stopScheduler,
  updateScheduledTask
};
