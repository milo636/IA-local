const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = require("../server");
const actions = require("../src/actions");
const agent = require("../src/agent");
const memory = require("../src/memory");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE_NAMES = ["memory.json", "logs.json", "settings.json"];

test("preguntar por una confirmacion la conserva y no ejecuta la accion", async () => {
  await withDataBackup(async () => {
    resetRuntimeData();
    const pending = await agent.handleMessage("organizar descargas por tipo");
    assert.equal(pending.requiresConfirmation, true);
    assert.ok(memory.getPendingAction());

    const explanation = await agent.handleMessage("por que necesita confirmacion");
    assert.equal(explanation.detectedIntent, "context.why");
    assert.equal(explanation.aiDomain, "context");
    assert.match(explanation.reply, /sigue detenida|esta detenida/i);
    assert.ok(memory.getPendingAction());
    assert.equal(readJson("logs.json").some((entry) => entry.action === "action.organize_downloads"), false);
  });
});

test("una pregunta contextual no repite la ejecucion anterior", async () => {
  await withDataBackup(async () => {
    resetRuntimeData();
    const originalExecute = actions.executeAction;
    let executions = 0;
    actions.executeAction = async () => {
      executions += 1;
      return { message: "Estado local listo.", summary: "Estado mostrado." };
    };

    try {
      await agent.handleMessage("mostrar estado del sistema");
      assert.equal(executions, 1);
      const explanation = await agent.handleMessage("que hiciste recien");
      assert.equal(executions, 1);
      assert.equal(explanation.detectedIntent, "context.what");
      assert.match(explanation.reply, /estado basico del sistema/i);
    } finally {
      actions.executeAction = originalExecute;
    }
  });
});

test("la seguridad general sigue siendo una respuesta conversacional", async () => {
  await withDataBackup(async () => {
    resetRuntimeData();
    const response = await agent.handleMessage("es seguro");
    assert.equal(response.aiDomain, "conversation");
    assert.equal(response.detectedIntent, "security");
    assert.match(response.reply, /local|datos|permisos/i);
    assert.equal(memory.getCommandContext(), null);
  });
});

test("los endpoints muestran y olvidan solo el contexto estructurado", async () => {
  await withDataBackup(async () => {
    resetRuntimeData({
      intent: "system_status",
      actionType: "system_status",
      entities: {},
      originalText: "mostrar estado del sistema",
      storableCommand: "mostrar estado del sistema",
      executed: true,
      updatedAt: "2026-07-18T10:00:00.000Z"
    });

    await withTestServer(async (baseUrl) => {
      const current = await jsonFetch(`${baseUrl}/api/context`);
      assert.equal(current.status, 200);
      assert.equal(current.payload.context.status, "completed");
      assert.equal(current.payload.context.actionType, "system_status");
      assert.equal(Object.hasOwn(current.payload.context, "originalText"), false);
      assert.doesNotMatch(JSON.stringify(current.payload.context), /storableCommand|entities/);

      const cleared = await jsonFetch(`${baseUrl}/api/context/clear`, { method: "POST" });
      assert.equal(cleared.status, 200);
      assert.equal(cleared.payload.state.context.status, "empty");
      assert.equal(memory.getCommandContext(), null);
      assert.ok(readJson("logs.json").some((entry) => entry.action === "context.clear"));
      assert.equal(readJson("logs.json").some((entry) => String(entry.action).startsWith("action.")), false);
    });
  });
});

test("no permite olvidar contexto mientras hay una confirmacion pendiente", async () => {
  await withDataBackup(async () => {
    resetRuntimeData();
    await agent.handleMessage("organizar descargas por tipo");
    await withTestServer(async (baseUrl) => {
      const response = await jsonFetch(`${baseUrl}/api/context/clear`, { method: "POST" });
      assert.equal(response.status, 409);
      assert.equal(response.payload.context.status, "pending_confirmation");
      assert.ok(memory.getPendingAction());
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
  const response = await fetch(url, options);
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
      if (!["EBUSY", "EACCES", "EPERM"].includes(error.code) || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 40));
    }
  }
}

function resetRuntimeData(commandContext = null) {
  fs.writeFileSync(path.join(DATA_DIR, "memory.json"), JSON.stringify({
    messages: [],
    pendingAction: null,
    pendingClarification: null,
    commandContext
  }, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, "logs.json"), "[]\n", "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "settings.json"), JSON.stringify({
    safeMode: true,
    allowOpenApps: true,
    allowFileRead: true,
    allowFileWrite: true,
    allowDelete: false,
    allowShellCommands: false,
    allowNetwork: false,
    allowScheduledActions: false
  }, null, 2));
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
}
