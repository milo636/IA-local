const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = require("../server");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILES_TO_BACKUP = [
  path.join(DATA_DIR, "userProfile.json"),
  path.join(DATA_DIR, "logs.json"),
  path.join(DATA_DIR, "memory.json")
];

test("POST /api/memory guarda recuerdo y no ejecuta acciones", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Uso Chrome como navegador principal" })
      });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.ok, true);
      assert.equal(payload.memoryState.profile.preferredBrowser, "Chrome");
      assert.equal(payload.memoryState.stats.memoryCount, 1);

      const logs = readJson("logs.json");
      assert.ok(logs.some((log) => log.action === "memory.create"));
      assert.equal(logs.some((log) => String(log.action).startsWith("action.")), false);
    });
  });
});

test("GET /api/memory/search encuentra recuerdos", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      await fetch(`${baseUrl}/api/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Uso Chrome como navegador principal" })
      });

      const response = await fetch(`${baseUrl}/api/memory/search?q=${encodeURIComponent("que navegador uso")}`);
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.ok(payload.results.length >= 1);
      assert.match(payload.results[0].text, /Chrome|Navegador/i);
    });
  });
});

test("PUT y DELETE /api/memory editan y borran recuerdos", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      const createResponse = await fetch(`${baseUrl}/api/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Uso Chrome" })
      });
      const createPayload = await createResponse.json();

      const updateResponse = await fetch(`${baseUrl}/api/memory/${createPayload.memory.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Uso Firefox como navegador principal" })
      });
      const updatePayload = await updateResponse.json();

      assert.equal(updateResponse.status, 200);
      assert.equal(updatePayload.memoryState.profile.preferredBrowser, "Firefox");

      const deleteResponse = await fetch(`${baseUrl}/api/memory/${createPayload.memory.id}`, { method: "DELETE" });
      const deletePayload = await deleteResponse.json();

      assert.equal(deleteResponse.status, 200);
      assert.equal(deletePayload.deleted.length, 1);
      assert.equal(deletePayload.memoryState.stats.memoryCount, 0);
    });
  });
});

test("POST /api/memory rechaza datos sensibles", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Mi tarjeta de credito es 4111 1111 1111 1111" })
      });
      const payload = await response.json();

      assert.equal(response.status, 400);
      assert.match(payload.error, /sensibles/i);
      assert.ok(payload.findings.some((finding) => finding.type === "banking_data" || finding.type === "long_number"));
      assert.equal(readJson("userProfile.json").memories.length, 0);
    });
  });
});

test("GET /api/memory/export descarga memoria local", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await withTestServer(async (baseUrl) => {
      await fetch(`${baseUrl}/api/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Prefiero modo oscuro" })
      });

      const response = await fetch(`${baseUrl}/api/memory/export`);
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-disposition"), /atenea-local-memory/);
      assert.equal(payload.app, "SAW Local");
      assert.equal(payload.memory.stats.memoryCount, 1);
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
  }
}

function resetRuntimeData() {
  fs.writeFileSync(path.join(DATA_DIR, "logs.json"), "[]\n", "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "memory.json"), '{\n  "messages": [],\n  "pendingAction": null\n}\n', "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "userProfile.json"), '{\n  "version": 1,\n  "preferredBrowser": null,\n  "preferredTheme": "Dark",\n  "favoriteFolders": [],\n  "customPreferences": {},\n  "memories": [],\n  "createdAt": null,\n  "updatedAt": null\n}\n', "utf8");
}

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), "utf8"));
}
