const express = require("express");
const path = require("path");

const { handleMessage } = require("./src/agent");
const actions = require("./src/actions");
const fileManager = require("./src/fileManager");
const logger = require("./src/logger");
const localAI = require("./src/localAI");
const memory = require("./src/memory");
const permissions = require("./src/permissions");

const app = express();
const port = Number(process.env.PORT || 3000);

fileManager.ensureDataFiles();

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, app: "SAW Local", localOnly: true });
});

app.get("/api/state", (req, res) => {
  res.json(buildState());
});

app.post("/api/chat", async (req, res) => {
  try {
    const message = typeof req.body.message === "string" ? req.body.message : "";

    if (!message.trim()) {
      return res.status(400).json({ error: "El mensaje no puede estar vacio." });
    }

    const result = await handleMessage(message);
    return res.json({ ...result, state: buildState() });
  } catch (error) {
    logger.writeLog({
      level: "error",
      action: "chat",
      message: "Error procesando mensaje",
      details: { error: error.message }
    });
    return res.status(500).json({
      error: "No pude procesar el mensaje. Revisa los logs locales."
    });
  }
});

app.post("/api/settings", (req, res) => {
  try {
    const updated = permissions.updateSettings(req.body || {});
    logger.writeLog({
      level: "info",
      action: "settings.update",
      message: "Configuracion local actualizada",
      details: { keys: Object.keys(req.body || {}) }
    });
    res.json({ settings: updated, state: buildState() });
  } catch (error) {
    logger.writeLog({
      level: "warn",
      action: "settings.update.denied",
      message: "No se pudo actualizar la configuracion",
      details: { error: error.message }
    });
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/ai/intents", (req, res) => {
  res.json({
    intents: localAI.listIntents(),
    status: localAI.getModelStatus()
  });
});

app.post("/api/ai/learn", (req, res) => {
  try {
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    const intent = typeof req.body.intent === "string" ? req.body.intent.trim() : "";

    if (!text) {
      return res.status(400).json({ error: "El ejemplo no puede estar vacio." });
    }

    if (!localAI.VALID_INTENTS.has(intent)) {
      return res.status(400).json({ error: "La intencion seleccionada no esta permitida." });
    }

    const learnResult = localAI.addTrainingExample(intent, text);
    const model = localAI.trainAndSave();

    logger.writeLog({
      level: "info",
      action: "ai.learn",
      message: learnResult.added ? "Ejemplo agregado y modelo reentrenado" : "Ejemplo existente y modelo reentrenado",
      details: {
        intent,
        added: learnResult.added,
        textLength: text.length,
        examples: model.examples.length
      }
    });

    res.json({
      ok: true,
      added: learnResult.added,
      intent,
      status: localAI.getModelStatus(),
      state: buildState()
    });
  } catch (error) {
    logger.writeLog({
      level: "warn",
      action: "ai.learn.denied",
      message: "No se pudo aprender el ejemplo",
      details: { error: error.message }
    });
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/ai/train", (req, res) => {
  try {
    const model = localAI.trainAndSave();
    logger.writeLog({
      level: "info",
      action: "ai.train",
      message: "Modelo local reentrenado manualmente",
      details: {
        examples: model.examples.length,
        intents: model.intents.length
      }
    });
    res.json({ ok: true, status: localAI.getModelStatus(), state: buildState() });
  } catch (error) {
    logger.writeLog({
      level: "error",
      action: "ai.train.failed",
      message: "No se pudo reentrenar el modelo local",
      details: { error: error.message }
    });
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chat/clear", (req, res) => {
  memory.clearMessages();
  logger.writeLog({
    level: "info",
    action: "chat.clear",
    message: "Chat local limpiado por el usuario"
  });
  res.json({ state: buildState() });
});

app.get("/api/logs/export", (req, res) => {
  const logs = logger.getLogs();
  const fileName = `saw-local-logs-${new Date().toISOString().slice(0, 10)}.json`;

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(JSON.stringify(logs, null, 2));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

if (require.main === module) {
  app.listen(port, "127.0.0.1", () => {
    console.log(`SAW Local listo en http://127.0.0.1:${port}`);
  });
}

function buildState() {
  return {
    ai: localAI.getModelStatus(),
    intents: localAI.listIntents(),
    settings: permissions.getSettings(),
    memory: memory.getMemory(),
    logs: logger.getRecentLogs(30),
    actions: actions.listActions()
  };
}

module.exports = app;
