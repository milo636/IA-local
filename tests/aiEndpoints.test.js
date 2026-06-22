const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = require("../server");
const localAI = require("../src/localAI");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILES_TO_BACKUP = [
  path.join(DATA_DIR, "trainingData.json"),
  path.join(DATA_DIR, "localAIModel.json"),
  path.join(DATA_DIR, "logs.json"),
  path.join(DATA_DIR, "memory.json")
];

test("GET /api/ai/intents lista solo intenciones permitidas", async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/intents`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.ok(payload.intents.some((intent) => intent.id === "open_app"));
    assert.ok(payload.intents.some((intent) => intent.id === "unknown"));
    assert.equal(payload.intents.some((intent) => intent.id === "invented_intent"), false);
  });
});

test("POST /api/ai/learn guarda ejemplo, reentrena y no ejecuta acciones", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      const text = `listar descargas aprendizaje endpoint ${Date.now()}`;
      const response = await fetch(`${baseUrl}/api/ai/learn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, intent: "list_downloads" })
      });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.ok, true);
      assert.equal(payload.intent, "list_downloads");
      assert.equal(payload.status.available, true);

      const trainingData = readJson("trainingData.json");
      assert.ok(trainingData.intents.list_downloads.includes(text));

      const model = readJson("localAIModel.json");
      assert.equal(typeof model.trainedAt, "string");

      const logs = readJson("logs.json");
      assert.ok(logs.some((log) => log.action === "ai.learn"));
      assert.equal(logs.some((log) => String(log.action).startsWith("action.")), false);
    });
  });
});

test("POST /api/ai/learn rechaza intenciones arbitrarias", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/learn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "ejemplo cualquiera", intent: "invented_intent" })
      });
      const payload = await response.json();

      assert.equal(response.status, 400);
      assert.match(payload.error, /no esta permitida/i);

      const trainingData = readJson("trainingData.json");
      assert.equal(Object.hasOwn(trainingData.intents, "invented_intent"), false);
    });
  });
});

test("POST /api/ai/train reentrena manualmente", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/train`, { method: "POST" });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.ok, true);
      assert.equal(payload.status.available, true);
      assert.ok(payload.status.exampleCount > 0);

      const logs = readJson("logs.json");
      assert.ok(logs.some((log) => log.action === "ai.train"));
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
    localAI.resetModelCache();
  }
}

function resetRuntimeData() {
  fs.writeFileSync(path.join(DATA_DIR, "logs.json"), "[]\n", "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "memory.json"), '{\n  "messages": [],\n  "pendingAction": null\n}\n', "utf8");
  localAI.resetModelCache();
}

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), "utf8"));
}
