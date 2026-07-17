const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = require("../server");
const memory = require("../src/memory");

const DATA_DIR = path.join(__dirname, "..", "data");
const MEMORY_PATH = path.join(DATA_DIR, "memory.json");
const LOGS_PATH = path.join(DATA_DIR, "logs.json");

test("migra el chat heredado a una conversacion local", async () => {
  await withRuntimeBackup(async () => {
    writeLegacyMemory([
      { id: "old-1", role: "user", content: "Proyecto local", meta: {}, timestamp: "2026-01-01T10:00:00.000Z" }
    ]);

    const current = memory.getMemory();
    assert.equal(current.activeConversationId, "chat-main");
    assert.equal(current.messages.length, 1);
    assert.equal(current.conversations.length, 1);
    assert.equal(current.conversations[0].title, "Proyecto local");
  });
});

test("aisla mensajes, contexto y confirmaciones entre conversaciones", async () => {
  await withRuntimeBackup(async () => {
    writeLegacyMemory([]);

    memory.addMessage("user", "Primera tarea");
    const firstId = memory.getMemory().activeConversationId;
    memory.setPendingAction({ id: "pending-1", action: { type: "organize_downloads" } });
    memory.setCommandContext({ intent: "search_files", entities: { searchTerm: "factura" } });

    const second = memory.createConversation();
    assert.notEqual(second.id, firstId);
    assert.deepEqual(memory.getMemory().messages, []);
    assert.equal(memory.getPendingAction(), null);
    assert.equal(memory.getCommandContext(), null);

    memory.addMessage("user", "Segunda tarea");
    memory.activateConversation(firstId);
    assert.equal(memory.getMemory().messages[0].content, "Primera tarea");
    assert.equal(memory.getPendingAction().id, "pending-1");
    assert.equal(memory.getCommandContext().entities.searchTerm, "factura");

    memory.clearMessages();
    assert.deepEqual(memory.getMemory().messages, []);
    assert.equal(memory.getPendingAction(), null);
    assert.equal(memory.getCommandContext(), null);

    memory.activateConversation(second.id);
    assert.equal(memory.getMemory().messages[0].content, "Segunda tarea");
  });
});

test("renombra de forma segura y siempre conserva una conversacion", async () => {
  await withRuntimeBackup(async () => {
    writeLegacyMemory([]);
    const id = memory.getMemory().activeConversationId;
    const renamed = memory.renameConversation(id, "Trabajo diario");
    assert.equal(renamed.title, "Trabajo diario");

    assert.throws(
      () => memory.renameConversation(id, "token: ghp_123456789012345678901234"),
      /sensible/i
    );

    const result = memory.deleteConversation(id);
    assert.equal(result.deleted.id, id);
    assert.equal(result.memory.conversations.length, 1);
    assert.notEqual(result.memory.activeConversationId, id);
  });
});

test("endpoints administran conversaciones sin ejecutar acciones", async () => {
  await withRuntimeBackup(async () => {
    writeLegacyMemory([]);
    fs.writeFileSync(LOGS_PATH, "[]\n", "utf8");

    await withTestServer(async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/api/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Ideas locales" })
      });
      const createPayload = await createResponse.json();
      assert.equal(createResponse.status, 201);
      assert.equal(createPayload.conversation.title, "Ideas locales");

      const listResponse = await fetch(`${baseUrl}/api/conversations`);
      const listPayload = await listResponse.json();
      assert.equal(listResponse.status, 200);
      assert.equal(listPayload.conversations.length, 2);
      assert.equal(listPayload.activeConversationId, createPayload.conversation.id);

      const previous = listPayload.conversations.find((item) => item.id !== createPayload.conversation.id);
      const activateResponse = await fetch(`${baseUrl}/api/conversations/${previous.id}/activate`, { method: "POST" });
      const activatePayload = await activateResponse.json();
      assert.equal(activateResponse.status, 200);
      assert.equal(activatePayload.state.memory.activeConversationId, previous.id);

      const renameResponse = await fetch(`${baseUrl}/api/conversations/${createPayload.conversation.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Ideas del proyecto" })
      });
      assert.equal(renameResponse.status, 200);

      const unconfirmedDelete = await fetch(`${baseUrl}/api/conversations/${createPayload.conversation.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      assert.equal(unconfirmedDelete.status, 409);

      const deleteResponse = await fetch(`${baseUrl}/api/conversations/${createPayload.conversation.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true })
      });
      assert.equal(deleteResponse.status, 200);

      const logs = JSON.parse(fs.readFileSync(LOGS_PATH, "utf8"));
      assert.ok(logs.some((entry) => entry.action === "conversation_history.create"));
      assert.ok(logs.some((entry) => entry.action === "conversation_history.rename"));
      assert.ok(logs.some((entry) => entry.action === "conversation_history.delete"));
      assert.equal(logs.some((entry) => String(entry.action).startsWith("action.")), false);
    });
  });
});

function writeLegacyMemory(messages) {
  fs.writeFileSync(MEMORY_PATH, `${JSON.stringify({ messages, pendingAction: null }, null, 2)}\n`, "utf8");
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
