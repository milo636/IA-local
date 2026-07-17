const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const permissions = require("../src/permissions");
const scheduler = require("../src/scheduler");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE_NAMES = ["scheduledTasks.json", "settings.json", "logs.json"];

test("crea, pausa, reanuda y borra tareas sin ejecutar comandos", async () => {
  await withDataBackup(async () => {
    resetData();
    const now = Date.parse("2026-07-17T12:00:00.000Z");
    const task = scheduler.createScheduledTask({
      name: "Revision diaria",
      command: "mostrar estado del sistema",
      runAt: "2026-07-17T12:30:00.000Z",
      repeat: "daily",
      autoRun: false
    }, { now });

    assert.equal(task.status, "scheduled");
    assert.equal(task.actionType, "system_status");
    assert.equal(scheduler.updateScheduledTask(task.id, { enabled: false }, { now }).status, "paused");
    assert.equal(scheduler.updateScheduledTask(task.id, { enabled: true }, { now }).status, "scheduled");
    assert.equal(scheduler.deleteScheduledTask(task.id).id, task.id);
    assert.equal(scheduler.listScheduledTasks().length, 0);
  });
});

test("bloquea comandos arbitrarios, datos sensibles y autoejecucion con escritura", async () => {
  await withDataBackup(async () => {
    resetData();
    const runAt = new Date(Date.now() + 60000).toISOString();
    assert.throws(() => scheduler.createScheduledTask({
      name: "Shell",
      command: "powershell Get-ChildItem",
      runAt
    }), /allowlist|comandos exactos/i);
    assert.throws(() => scheduler.createScheduledTask({
      name: "token ghp_123456789012345678901234",
      command: "ayuda",
      runAt
    }), /sensible/i);
    assert.throws(() => scheduler.createScheduledTask({
      name: "Abrir navegador",
      command: "abrir chrome",
      runAt,
      autoRun: true
    }), /solo admite acciones de lectura/i);
    const safeTask = scheduler.createScheduledTask({
      name: "Lectura manual",
      command: "ayuda",
      runAt,
      autoRun: false
    });
    assert.throws(
      () => scheduler.updateScheduledTask(safeTask.id, { autoRun: "true" }),
      /verdadera o falsa/i
    );
    scheduler.deleteScheduledTask(safeTask.id);
    assert.equal(scheduler.listScheduledTasks().length, 0);
  });
});

test("el procesador automatico requiere permiso y solo ejecuta tareas aptas", async () => {
  await withDataBackup(async () => {
    resetData();
    const now = Date.now();
    const task = scheduler.createScheduledTask({
      name: "Estado automatico",
      command: "mostrar estado del sistema",
      runAt: new Date(now).toISOString(),
      autoRun: true
    }, { now });
    let executions = 0;

    const denied = await scheduler.processDueTasks({
      now,
      execute: async () => { executions += 1; }
    });
    assert.equal(denied.skipped, "permission");
    assert.equal(executions, 0);
    assert.equal(scheduler.findScheduledTask(task.id, { now }).status, "due");

    permissions.updateSettings({ allowScheduledActions: true });
    const processed = await scheduler.processDueTasks({
      now,
      execute: async (scheduledTask) => {
        executions += 1;
        assert.equal(scheduledTask.actionType, "system_status");
      }
    });
    assert.equal(processed.processed, 1);
    assert.equal(executions, 1);
    assert.equal(scheduler.findScheduledTask(task.id).status, "completed");
  });
});

test("una tarea repetida calcula la proxima fecha despues de ejecutarse", async () => {
  await withDataBackup(async () => {
    resetData();
    const now = Date.parse("2026-07-17T12:00:00.000Z");
    const task = scheduler.createScheduledTask({
      name: "Revision semanal",
      command: "listar archivos de descargas",
      runAt: "2026-07-17T12:00:00.000Z",
      repeat: "weekly"
    }, { now });
    const updated = scheduler.recordTaskRun(task.id, "completed", { now });
    assert.equal(updated.status, "scheduled");
    assert.equal(updated.nextRunAt, "2026-07-24T12:00:00.000Z");
    assert.equal(updated.runCount, 1);
  });
});

async function withDataBackup(callback) {
  const backups = new Map(FILE_NAMES.map((name) => {
    const filePath = path.join(DATA_DIR, name);
    return [filePath, fs.existsSync(filePath) ? fs.readFileSync(filePath) : null];
  }));
  try {
    await callback();
  } finally {
    scheduler.stopScheduler();
    for (const [filePath, contents] of backups) {
      if (contents === null) fs.rmSync(filePath, { force: true });
      else fs.writeFileSync(filePath, contents);
    }
  }
}

function resetData() {
  fs.writeFileSync(path.join(DATA_DIR, "scheduledTasks.json"), '{\n  "version": 1,\n  "items": [],\n  "updatedAt": null\n}\n', "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "logs.json"), "[]\n", "utf8");
  permissions.updateSettings({ allowScheduledActions: false });
}
