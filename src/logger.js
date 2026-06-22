const { DATA_FILES, DEFAULT_LOGS, readJson, writeJson } = require("./fileManager");

function writeLog(entry) {
  const logs = getLogs();
  const safeEntry = {
    id: cryptoId(),
    timestamp: new Date().toISOString(),
    level: entry.level || "info",
    action: entry.action || "system",
    message: entry.message || "",
    details: entry.details || null
  };

  logs.push(safeEntry);
  writeJson(DATA_FILES.logs, logs.slice(-500));
  return safeEntry;
}

function getLogs() {
  const logs = readJson(DATA_FILES.logs, DEFAULT_LOGS);
  return Array.isArray(logs) ? logs : [];
}

function getRecentLogs(limit = 25) {
  return getLogs().slice(-limit).reverse();
}

function cryptoId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = {
  getLogs,
  getRecentLogs,
  writeLog
};
