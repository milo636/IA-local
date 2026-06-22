const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = require("../server");
const localAI = require("../src/localAI");

const DATA_DIR = path.join(__dirname, "..", "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
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
      const text = "listar descargas aprendizaje endpoint comunitario";
      const backupCount = countBackups();
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
      assert.ok(countBackups() > backupCount);
    });
  });
});

test("POST /api/ai/learn advierte antes de guardar texto sensible", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      const text = "crear nota con email persona@example.com";
      const backupCount = countBackups();
      const response = await fetch(`${baseUrl}/api/ai/learn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, intent: "create_note" })
      });
      const payload = await response.json();

      assert.equal(response.status, 409);
      assert.equal(payload.requiresConfirmation, true);
      assert.ok(payload.findings.some((finding) => finding.type === "email"));

      const trainingData = readJson("trainingData.json");
      assert.equal(trainingData.intents.create_note.includes(text), false);
      assert.equal(countBackups(), backupCount);

      const logs = readJson("logs.json");
      assert.ok(logs.some((log) => log.action === "ai.learn.sensitive_warning"));
      assert.equal(logs.some((log) => String(log.action).startsWith("action.")), false);
    });
  });
});

test("POST /api/ai/learn guarda texto sensible solo con confirmacion explicita", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      const text = "buscar archivo en C:\\Users\\Persona\\Downloads";
      const response = await fetch(`${baseUrl}/api/ai/learn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, intent: "search_files", confirmSensitive: true })
      });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.ok, true);

      const trainingData = readJson("trainingData.json");
      assert.ok(trainingData.intents.search_files.includes(text));

      const logs = readJson("logs.json");
      const learnLog = logs.find((log) => log.action === "ai.learn");
      assert.equal(learnLog.details.sensitiveConfirmed, true);
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

test("GET /api/ai/examples lista ejemplos con IDs", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/examples`);
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.ok(Array.isArray(payload.dataset.examples));
      assert.ok(payload.dataset.examples.length > 0);
      assert.equal(typeof payload.dataset.examples[0].id, "string");
      assert.ok(payload.dataset.grouped.help.length > 0);
    });
  });
});

test("PUT /api/ai/examples/:id edita ejemplo, reentrena y no ejecuta acciones", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      const examplesResponse = await fetch(`${baseUrl}/api/ai/examples`);
      const examplesPayload = await examplesResponse.json();
      const example = examplesPayload.dataset.examples.find((item) => item.intent === "help");
      const text = "ayuda comunitaria para editar ejemplo";
      const backupCount = countBackups();

      const response = await fetch(`${baseUrl}/api/ai/examples/${example.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, intent: "help" })
      });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.ok, true);
      assert.equal(payload.example.intent, "help");

      const trainingData = readJson("trainingData.json");
      assert.ok(trainingData.intents.help.includes(text));
      assert.equal(trainingData.intents.help.includes(example.text), false);
      assert.ok(countBackups() > backupCount);

      const logs = readJson("logs.json");
      assert.ok(logs.some((log) => log.action === "ai.example.update"));
      assert.equal(logs.some((log) => String(log.action).startsWith("action.")), false);
    });
  });
});

test("DELETE /api/ai/examples/:id borra ejemplo, reentrena y no ejecuta acciones", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      const examplesResponse = await fetch(`${baseUrl}/api/ai/examples`);
      const examplesPayload = await examplesResponse.json();
      const example = examplesPayload.dataset.examples.find((item) => item.intent === "unknown");
      const backupCount = countBackups();

      const response = await fetch(`${baseUrl}/api/ai/examples/${example.id}`, { method: "DELETE" });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.deleted, true);

      const trainingData = readJson("trainingData.json");
      assert.equal(trainingData.intents.unknown.includes(example.text), false);
      assert.ok(countBackups() > backupCount);

      const logs = readJson("logs.json");
      assert.ok(logs.some((log) => log.action === "ai.example.delete"));
      assert.equal(logs.some((log) => String(log.action).startsWith("action.")), false);
    });
  });
});

test("POST /api/ai/dataset/export descarga el dataset local", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/ai/dataset/export`, { method: "POST" });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-disposition"), /atenea-local-dataset/);
      assert.equal(payload.app, "SAW Local");
      assert.ok(payload.dataset.intents.help.length > 0);

      const logs = readJson("logs.json");
      assert.ok(logs.some((log) => log.action === "ai.dataset.export"));
    });
  });
});

test("POST /api/ai/dataset/restore-base restaura base y crea backup", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      const customText = "listar descargas ejemplo para restaurar";
      await fetch(`${baseUrl}/api/ai/learn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: customText, intent: "list_downloads" })
      });

      assert.ok(readJson("trainingData.json").intents.list_downloads.includes(customText));
      const backupCount = countBackups();

      const response = await fetch(`${baseUrl}/api/ai/dataset/restore-base`, { method: "POST" });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.restored, true);
      assert.equal(readJson("trainingData.json").intents.list_downloads.includes(customText), false);
      assert.ok(countBackups() > backupCount);

      const logs = readJson("logs.json");
      assert.ok(logs.some((log) => log.action === "ai.dataset.restore_base"));
      assert.equal(logs.some((log) => String(log.action).startsWith("action.")), false);
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
  const originalBackupNames = fs.existsSync(BACKUP_DIR) ? new Set(fs.readdirSync(BACKUP_DIR)) : null;

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
    cleanupBackupDir(originalBackupNames);
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

function countBackups() {
  return fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).length : 0;
}

function cleanupBackupDir(originalBackupNames) {
  if (!fs.existsSync(BACKUP_DIR)) return;

  for (const fileName of fs.readdirSync(BACKUP_DIR)) {
    if (!originalBackupNames || !originalBackupNames.has(fileName)) {
      fs.rmSync(path.join(BACKUP_DIR, fileName), { force: true });
    }
  }

  if (!originalBackupNames && fs.existsSync(BACKUP_DIR) && fs.readdirSync(BACKUP_DIR).length === 0) {
    fs.rmdirSync(BACKUP_DIR);
  }
}
