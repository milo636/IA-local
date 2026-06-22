const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = require("../server");
const conversationAI = require("../src/conversationAI");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILES_TO_BACKUP = [
  path.join(DATA_DIR, "conversations.json"),
  path.join(DATA_DIR, "conversationModel.json"),
  path.join(DATA_DIR, "logs.json"),
  path.join(DATA_DIR, "memory.json")
];

test("GET /api/conversation/intents lista intenciones conversacionales", async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/conversation/intents`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.ok(payload.intents.some((intent) => intent.id === "greeting"));
    assert.ok(payload.intents.some((intent) => intent.id === "capabilities"));
    assert.equal(payload.intents.some((intent) => intent.id === "invented_intent"), false);
  });
});

test("POST /api/conversation/learn aprende respuesta y no ejecuta acciones", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      const text = "como te puedo nombrar";
      const responseText = "Podes decirme Atenea Local.";
      const response = await fetch(`${baseUrl}/api/conversation/learn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, intent: "identity", response: responseText })
      });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.ok, true);
      assert.equal(payload.intent, "identity");
      assert.equal(payload.status.available, true);

      const conversations = readJson("conversations.json");
      assert.ok(conversations.intents.identity.examples.includes(text));
      assert.ok(conversations.intents.identity.responses.some((item) => item.text === responseText && item.source === "learned"));

      const logs = readJson("logs.json");
      assert.ok(logs.some((log) => log.action === "conversation.learn"));
      assert.equal(logs.some((log) => String(log.action).startsWith("action.")), false);
    });
  });
});

test("POST /api/conversation/learn advierte con texto sensible", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      const text = "mi email es persona@example.com";
      const response = await fetch(`${baseUrl}/api/conversation/learn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, intent: "identity", response: "Soy Atenea." })
      });
      const payload = await response.json();

      assert.equal(response.status, 409);
      assert.equal(payload.requiresConfirmation, true);
      assert.ok(payload.findings.some((finding) => finding.type === "email"));

      const conversations = readJson("conversations.json");
      assert.equal(conversations.intents.identity.examples.includes(text), false);
    });
  });
});

test("POST /api/conversation/train reentrena modelo conversacional", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/conversation/train`, { method: "POST" });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.ok, true);
      assert.equal(payload.status.available, true);
      assert.ok(payload.status.responseCount > 0);

      const logs = readJson("logs.json");
      assert.ok(logs.some((log) => log.action === "conversation.train"));
    });
  });
});

async function withTestServer(callback) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function withLocalDataBackup(callback) {
  const backups = new Map(
    FILES_TO_BACKUP.map((filePath) => [filePath, fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null])
  );

  try {
    await callback();
  } finally {
    for (const [filePath, contents] of backups.entries()) {
      if (contents === null) {
        if (fs.existsSync(filePath)) fs.rmSync(filePath);
      } else {
        fs.writeFileSync(filePath, contents, "utf8");
      }
    }
    conversationAI.resetModelCache();
  }
}

function resetRuntimeData() {
  fs.writeFileSync(path.join(DATA_DIR, "logs.json"), "[]\n", "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "memory.json"), '{\n  "messages": [],\n  "pendingAction": null\n}\n', "utf8");
  conversationAI.resetModelCache();
}

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), "utf8"));
}
