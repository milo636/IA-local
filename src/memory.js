const { DATA_FILES, DEFAULT_MEMORY, readJson, writeJson } = require("./fileManager");

function getMemory() {
  const memory = readJson(DATA_FILES.memory, DEFAULT_MEMORY);
  return {
    messages: Array.isArray(memory.messages) ? memory.messages : [],
    pendingAction: memory.pendingAction || null
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

function clearMessages() {
  const current = getMemory();
  current.messages = [];
  saveMemory(current);
}

function saveMemory(value) {
  writeJson(DATA_FILES.memory, {
    messages: Array.isArray(value.messages) ? value.messages : [],
    pendingAction: value.pendingAction || null
  });
}

module.exports = {
  addMessage,
  clearMessages,
  clearPendingAction,
  getMemory,
  getPendingAction,
  saveMemory,
  setPendingAction
};
