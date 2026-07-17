const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = require("../server");
const safety = require("../src/safety");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE_NAMES = ["scheduledTasks.json", "settings.json", "logs.json", "memory.json"];

test("endpoints crean y actualizan agenda sin ejecutar acciones", async () => {
  await withDataBackup(async () => {
    resetData();
    await withTestServer(async (baseUrl) => {
      const create = await jsonFetch(`${baseUrl}/api/scheduled-tasks`, {
        method: "POST",
        body: {
          name: "Revision local",
          command: "mostrar estado del sistema",
          runAt: new Date(Date.now() + 60000).toISOString(),
          repeat: "none",
          autoRun: false
        }
      });
      assert.equal(create.status, 201);
      assert.equal(create.payload.task.status, "scheduled");
      assert.equal(readJson("logs.json").some((entry) => String(entry.action).startsWith("action.")), false);

      const pause = await jsonFetch(`${baseUrl}/api/scheduled-tasks/${create.payload.task.id}`, {
        method: "PUT",
        body: { enabled: false }
      });
      assert.equal(pause.payload.task.status, "paused");

      const list = await jsonFetch(`${baseUrl}/api/scheduled-tasks`);
      assert.equal(list.payload.scheduledTasks.length, 1);
      assert.equal(list.payload.state.settings.allowScheduledActions, false);
    });
  });
});

test("ejecutar una tarea manual vuelve a pasar por safety", async () => {
  await withDataBackup(async () => {
    resetData();
    await withTestServer(async (baseUrl) => {
      const create = await jsonFetch(`${baseUrl}/api/scheduled-tasks`, {
        method: "POST",
        body: {
          name: "Estado manual",
          command: "mostrar estado del sistema",
          runAt: new Date(Date.now() + 60000).toISOString()
        }
      });
      const originalValidateAction = safety.validateAction;
      let safetyChecks = 0;
      safety.validateAction = (action) => {
        safetyChecks += 1;
        return originalValidateAction(action);
      };

      try {
        const run = await jsonFetch(`${baseUrl}/api/scheduled-tasks/${create.payload.task.id}/run`, { method: "POST" });
        assert.equal(run.status, 200);
        assert.match(run.payload.result.reply, /Estado del sistema/);
        assert.equal(run.payload.task.status, "completed");
        assert.ok(safetyChecks >= 1);
        assert.ok(readJson("logs.json").some((entry) => entry.action === "action.system_status"));
      } finally {
        safety.validateAction = originalValidateAction;
      }
    });
  });
});

test("endpoint rechaza autoejecucion no apta y exige confirmar el borrado", async () => {
  await withDataBackup(async () => {
    resetData();
    await withTestServer(async (baseUrl) => {
      const denied = await jsonFetch(`${baseUrl}/api/scheduled-tasks`, {
        method: "POST",
        body: {
          name: "Abrir solo",
          command: "abrir chrome",
          runAt: new Date(Date.now() + 60000).toISOString(),
          autoRun: true
        }
      });
      assert.equal(denied.status, 400);
      assert.match(denied.payload.error, /solo admite acciones de lectura/i);

      const create = await jsonFetch(`${baseUrl}/api/scheduled-tasks`, {
        method: "POST",
        body: {
          name: "Ayuda futura",
          command: "ayuda",
          runAt: new Date(Date.now() + 60000).toISOString()
        }
      });
      const unconfirmed = await jsonFetch(`${baseUrl}/api/scheduled-tasks/${create.payload.task.id}`, {
        method: "DELETE",
        body: {}
      });
      assert.equal(unconfirmed.status, 409);
      const removed = await jsonFetch(`${baseUrl}/api/scheduled-tasks/${create.payload.task.id}`, {
        method: "DELETE",
        body: { confirm: true }
      });
      assert.equal(removed.status, 200);
      assert.equal(removed.payload.state.scheduledTasks.length, 0);
    });
  });
});

test("exporta la agenda dentro del paquete local", async () => {
  await withDataBackup(async () => {
    resetData();
    await withTestServer(async (baseUrl) => {
      const agenda = await fetch(`${baseUrl}/api/scheduled-tasks/export`);
      const all = await fetch(`${baseUrl}/api/export/all`);
      const payload = await all.json();
      assert.match(agenda.headers.get("content-disposition"), /atenea-local-agenda/);
      assert.equal(payload.localOnly, true);
      assert.ok(payload.scheduledTasks);
    });
  });
});

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

async function jsonFetch(url, options = {}) {
  const request = { ...options };
  if (options.body && typeof options.body !== "string") {
    request.headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    request.body = JSON.stringify(options.body);
  }
  const response = await fetch(url, request);
  return { status: response.status, payload: await response.json() };
}

async function withDataBackup(callback) {
  const backups = new Map(FILE_NAMES.map((name) => {
    const filePath = path.join(DATA_DIR, name);
    return [filePath, fs.existsSync(filePath) ? fs.readFileSync(filePath) : null];
  }));
  try {
    await callback();
  } finally {
    for (const [filePath, contents] of backups) {
      await retryOneDriveWrite(async () => {
        if (contents === null) await fs.promises.rm(filePath, { force: true });
        else await fs.promises.writeFile(filePath, contents);
      });
    }
  }
}

async function retryOneDriveWrite(operation, attempts = 8) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      const retryable = ["EBUSY", "EACCES", "EPERM"].includes(error.code);
      if (!retryable || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 40));
    }
  }
}

function resetData() {
  fs.writeFileSync(path.join(DATA_DIR, "scheduledTasks.json"), '{\n  "version": 1,\n  "items": [],\n  "updatedAt": null\n}\n', "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "logs.json"), "[]\n", "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "memory.json"), '{\n  "messages": [],\n  "pendingAction": null\n}\n', "utf8");
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
}
