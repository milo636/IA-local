const { DATA_FILES, DEFAULT_MEMORY, readJson, writeJson } = require("./fileManager");

function getMemory() {
  const memory = readJson(DATA_FILES.memory, DEFAULT_MEMORY);
  return {
    messages: Array.isArray(memory.messages) ? memory.messages : [],
    pendingAction: memory.pendingAction || null,
    pendingClarification: memory.pendingClarification || null,
    commandContext: memory.commandContext || null
  };
}

function addMessage(role, content, meta = {}) {
  const current = getMemory();
  current.messages.push({
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    role,
    content,
    meta,
    timestamp: new Date().toISOString()
  });
  current.messages = current.messages.slice(-200);
  saveMemory(current);
  return current;
}

function setPendingAction(pendingAction) {
  const current = getMemory();
  current.pendingAction = pendingAction;
  saveMemory(current);
  return pendingAction;
}

function getPendingAction() {
  return getMemory().pendingAction;
}

function clearPendingAction() {
  const current = getMemory();
  current.pendingAction = null;
  saveMemory(current);
}

function setPendingClarification(pendingClarification) {
  const current = getMemory();
  current.pendingClarification = pendingClarification;
  saveMemory(current);
  return pendingClarification;
}

function getPendingClarification() {
  return getMemory().pendingClarification;
}

function clearPendingClarification() {
  const current = getMemory();
  current.pendingClarification = null;
  saveMemory(current);
}

function setCommandContext(commandContext) {
  const current = getMemory();
  current.commandContext = commandContext;
  saveMemory(current);
  return commandContext;
}

function getCommandContext() {
  return getMemory().commandContext;
}

function clearCommandContext() {
  const current = getMemory();
  current.commandContext = null;
  saveMemory(current);
}

function clearMessages() {
  const current = getMemory();
  current.messages = [];
  current.pendingClarification = null;
  current.commandContext = null;
  saveMemory(current);
}

function saveMemory(value) {
  writeJson(DATA_FILES.memory, {
    messages: Array.isArray(value.messages) ? value.messages : [],
    pendingAction: value.pendingAction || null,
    pendingClarification: value.pendingClarification || null,
    commandContext: value.commandContext || null
  });
}

module.exports = {
  addMessage,
  clearCommandContext,
  clearMessages,
  clearPendingClarification,
  clearPendingAction,
  getCommandContext,
  getMemory,
  getPendingClarification,
  getPendingAction,
  saveMemory,
  setCommandContext,
  setPendingClarification,
  setPendingAction
};
