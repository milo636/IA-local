const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const localAI = require("../src/localAI");
const { handleMessage } = require("../src/agent");

const DATA_DIR = path.join(__dirname, "..", "data");
const MEMORY_PATH = path.join(DATA_DIR, "memory.json");
const LOGS_PATH = path.join(DATA_DIR, "logs.json");

test("nunca saltea safety antes de clasificar con IA local", async () => {
  await withLocalDataBackup(async () => {
    const originalClassifier = localAI.classifyIntent;
    localAI.classifyIntent = () => {
      throw new Error("localAI no deberia ejecutarse si safety bloquea primero");
    };

    try {
      const result = await handleMessage("del C:\\Users\\Usuario\\Documents\\*.*");
      assert.match(result.reply, /Solicitud bloqueada por seguridad/);
      assert.equal(result.usedLocalAI, false);
      assert.equal(result.canLearn, false);
    } finally {
      localAI.classifyIntent = originalClassifier;
    }
  });
});

test("la respuesta de chat incluye metadata de IA local", async () => {
  await withLocalDataBackup(async () => {
    const result = await handleMessage("ayuda");

    assert.equal(result.detectedIntent, "help");
    assert.equal(result.usedLocalAI, true);
    assert.equal(result.canLearn, true);
    assert.ok(result.confidence > 0);
  });
});

test("la conversacion basica no ejecuta acciones", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();
    const result = await handleMessage("hola");

    assert.equal(result.detectedIntent, "greeting");
    assert.equal(result.usedLocalAI, true);
    assert.equal(result.canLearnResponse, true);
    assert.match(result.reply, /Hola|Buenas/);

    const logs = JSON.parse(fs.readFileSync(LOGS_PATH, "utf8"));
    assert.ok(logs.some((log) => log.action === "conversation.greeting"));
    assert.equal(logs.some((log) => String(log.action).startsWith("action.")), false);
  });
});

async function withLocalDataBackup(callback) {
  const originalMemory = fs.readFileSync(MEMORY_PATH, "utf8");
  const originalLogs = fs.readFileSync(LOGS_PATH, "utf8");

  try {
    await callback();
  } finally {
    fs.writeFileSync(MEMORY_PATH, originalMemory, "utf8");
    fs.writeFileSync(LOGS_PATH, originalLogs, "utf8");
  }
}

function resetRuntimeData() {
  fs.writeFileSync(LOGS_PATH, "[]\n", "utf8");
  fs.writeFileSync(MEMORY_PATH, '{\n  "messages": [],\n  "pendingAction": null\n}\n', "utf8");
}
