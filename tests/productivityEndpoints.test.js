const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = require("../server");
const safety = require("../src/safety");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE_NAMES = ["favorites.json", "routines.json", "logs.json", "memory.json"];

test("endpoints crean, listan y borran favoritos sin ejecutar al guardar", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();
    await withTestServer(async (baseUrl) => {
      const createResponse = await jsonFetch(`${baseUrl}/api/favorites`, {
        method: "POST",
        body: { name: "estado", command: "mostrar estado del sistema" }
      });
      assert.equal(createResponse.status, 201);
      assert.equal(createResponse.payload.favorite.actionType, "system_status");
      assert.equal(readJson("logs.json").some((log) => String(log.action).startsWith("action.")), false);

      const listResponse = await jsonFetch(`${baseUrl}/api/favorites`);
      assert.equal(listResponse.payload.favorites.length, 1);

      const deleteResponse = await jsonFetch(`${baseUrl}/api/favorites/${createResponse.payload.favorite.id}`, { method: "DELETE" });
      assert.equal(deleteResponse.status, 200);
      assert.equal(deleteResponse.payload.state.favorites.length, 0);
    });
  });
});

test("ejecutar favorito pasa obligatoriamente por safety y registra la accion", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();
    await withTestServer(async (baseUrl) => {
      const createResponse = await jsonFetch(`${baseUrl}/api/favorites`, {
        method: "POST",
        body: { name: "estado", command: "mostrar estado del sistema" }
      });
      const originalValidateAction = safety.validateAction;
      let safetyChecks = 0;
      safety.validateAction = (action) => {
        safetyChecks += 1;
        return originalValidateAction(action);
      };

      try {
        const runResponse = await jsonFetch(`${baseUrl}/api/favorites/${createResponse.payload.favorite.id}/run`, { method: "POST" });
        assert.equal(runResponse.status, 200);
        assert.match(runResponse.payload.result.reply, /Estado del sistema/);
        assert.ok(safetyChecks >= 1);
        const actionLog = readJson("logs.json").find((log) => log.action === "action.system_status");
        assert.equal(actionLog.details.source, "favorite");
      } finally {
        safety.validateAction = originalValidateAction;
      }
    });
  });
});

test("endpoints crean, ejecutan y borran rutinas permitidas", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();
    await withTestServer(async (baseUrl) => {
      const createResponse = await jsonFetch(`${baseUrl}/api/routines`, {
        method: "POST",
        body: { name: "revision", commands: ["mostrar estado del sistema", "ayuda"] }
      });
      assert.equal(createResponse.status, 201);
      assert.equal(createResponse.payload.routine.steps.length, 2);
      assert.equal(readJson("logs.json").some((log) => String(log.action).startsWith("action.")), false);

      const runResponse = await jsonFetch(`${baseUrl}/api/routines/${createResponse.payload.routine.id}/run`, { method: "POST" });
      assert.equal(runResponse.status, 200);
      assert.match(runResponse.payload.result.reply, /Estado del sistema/);
      assert.match(runResponse.payload.result.reply, /Comandos disponibles/);

      const deleteResponse = await jsonFetch(`${baseUrl}/api/routines/${createResponse.payload.routine.id}`, { method: "DELETE" });
      assert.equal(deleteResponse.payload.state.routines.length, 0);
    });
  });
});

test("rutina riesgosa se pausa para confirmar y no ejecuta la accion", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();
    await withTestServer(async (baseUrl) => {
      const createResponse = await jsonFetch(`${baseUrl}/api/routines`, {
        method: "POST",
        body: { name: "ordenar", commands: ["organizar descargas por tipo"] }
      });
      const runResponse = await jsonFetch(`${baseUrl}/api/routines/${createResponse.payload.routine.id}/run`, { method: "POST" });

      assert.equal(runResponse.status, 200);
      assert.match(runResponse.payload.result.reply, /CONFIRMAR/);
      assert.equal(runResponse.payload.state.memory.pendingAction.action.type, "organize_downloads");
      assert.equal(readJson("logs.json").some((log) => log.action === "action.organize_downloads"), false);
    });
  });
});

test("endpoint de rutinas bloquea comandos arbitrarios", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();
    await withTestServer(async (baseUrl) => {
      const response = await jsonFetch(`${baseUrl}/api/routines`, {
        method: "POST",
        body: { name: "invalida", commands: ["powershell Get-ChildItem"] }
      });
      assert.equal(response.status, 400);
      assert.match(response.payload.error, /allowlist|comandos exactos/i);
      assert.equal(readJson("routines.json").items.length, 0);
    });
  });
});

test("exporta favoritos, rutinas y paquete local completo", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();
    await withTestServer(async (baseUrl) => {
      const favoritesExport = await fetch(`${baseUrl}/api/favorites/export`);
      const routinesExport = await fetch(`${baseUrl}/api/routines/export`);
      const allExport = await fetch(`${baseUrl}/api/export/all`);
      const payload = await allExport.json();

      assert.match(favoritesExport.headers.get("content-disposition"), /atenea-local-favorites/);
      assert.match(routinesExport.headers.get("content-disposition"), /atenea-local-routines/);
      assert.match(allExport.headers.get("content-disposition"), /atenea-local-export/);
      assert.equal(payload.localOnly, true);
      assert.ok(payload.favorites);
      assert.ok(payload.routines);
      assert.ok(payload.memory);
      assert.ok(payload.dataset);
    });
  });
});

async function withTestServer(callback) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function jsonFetch(url, options = {}) {
  const request = { ...options };
  if (options.body && typeof options.body !== "string") {
    request.headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    request.body = JSON.stringify(options.body);
  }
  const response = await fetch(url, request);
  return { response, status: response.status, payload: await response.json() };
}

async function withLocalDataBackup(callback) {
  const backups = new Map(FILE_NAMES.map((name) => {
    const filePath = path.join(DATA_DIR, name);
    return [filePath, fs.readFileSync(filePath, "utf8")];
  }));
  try {
    await callback();
  } finally {
    for (const [filePath, contents] of backups) fs.writeFileSync(filePath, contents, "utf8");
  }
}

function resetRuntimeData() {
  fs.writeFileSync(path.join(DATA_DIR, "favorites.json"), '{\n  "version": 1,\n  "items": [],\n  "updatedAt": null\n}\n', "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "routines.json"), '{\n  "version": 1,\n  "items": [],\n  "updatedAt": null\n}\n', "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "logs.json"), "[]\n", "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "memory.json"), '{\n  "messages": [],\n  "pendingAction": null\n}\n', "utf8");
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
}
