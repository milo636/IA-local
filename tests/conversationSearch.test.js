const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = require("../server");
const memory = require("../src/memory");

const DATA_DIR = path.join(__dirname, "..", "data");
const MEMORY_PATH = path.join(DATA_DIR, "memory.json");
const LOGS_PATH = path.join(DATA_DIR, "logs.json");

test("busca mensajes con acentos entre conversaciones locales", async () => {
  await withRuntimeBackup(async () => {
    resetRuntime();
    memory.addMessage("user", "Necesito revisar la presentación anual", {});
    const firstId = memory.getMemory().activeConversationId;
    const second = memory.createConversation("Otro trabajo");
    memory.addMessage("assistant", "Podemos ordenar las facturas de junio", {});

    const presentation = memory.searchConversations("presentacion");
    const invoices = memory.searchConversations("facturas junio");
    assert.equal(presentation.length, 1);
    assert.equal(presentation[0].conversationId, firstId);
    assert.equal(invoices.length, 1);
    assert.equal(invoices[0].conversationId, second.id);
    assert.match(invoices[0].snippet, /facturas/i);
  });
});

test("el endpoint de busqueda es de solo lectura y no registra la consulta", async () => {
  await withRuntimeBackup(async () => {
    resetRuntime();
    const privateQuery = "marcadorprivado7421";
    memory.addMessage("user", `Revisar ${privateQuery} mañana`, {});
    const before = fs.readFileSync(MEMORY_PATH, "utf8");

    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/conversations/search?q=${privateQuery}`);
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.equal(payload.results.length, 1);
    });

    assert.equal(fs.readFileSync(MEMORY_PATH, "utf8"), before);
    const logs = JSON.parse(fs.readFileSync(LOGS_PATH, "utf8"));
    const searchLog = logs.find((entry) => entry.action === "conversation_history.search");
    assert.ok(searchLog);
    assert.equal(searchLog.details.queryLength, privateQuery.length);
    assert.equal(JSON.stringify(searchLog).includes(privateQuery), false);
    assert.equal(logs.some((entry) => String(entry.action).startsWith("action.")), false);
  });
});

function resetRuntime() {
  fs.writeFileSync(MEMORY_PATH, `${JSON.stringify({ messages: [], pendingAction: null }, null, 2)}\n`, "utf8");
  fs.writeFileSync(LOGS_PATH, "[]\n", "utf8");
}

async function withRuntimeBackup(callback) {
  const memoryBackup = fs.existsSync(MEMORY_PATH) ? fs.readFileSync(MEMORY_PATH) : null;
  const logsBackup = fs.existsSync(LOGS_PATH) ? fs.readFileSync(LOGS_PATH) : null;
  try {
    await callback();
  } finally {
    restoreFile(MEMORY_PATH, memoryBackup);
    restoreFile(LOGS_PATH, logsBackup);
  }
}

function restoreFile(filePath, contents) {
  if (contents === null) fs.rmSync(filePath, { force: true });
  else fs.writeFileSync(filePath, contents);
}

async function withTestServer(callback) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
