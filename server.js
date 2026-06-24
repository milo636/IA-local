const express = require("express");
const path = require("path");

const { handleMessage } = require("./src/agent");
const actions = require("./src/actions");
const conversationAI = require("./src/conversationAI");
const fileManager = require("./src/fileManager");
const logger = require("./src/logger");
const localAI = require("./src/localAI");
const memory = require("./src/memory");
const memoryEngine = require("./src/memoryEngine");
const permissions = require("./src/permissions");
const { detectSensitiveText } = require("./src/sensitiveText");

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

app.get("/api/memory", (req, res) => {
  try {
    res.json(memoryEngine.getMemoryState());
  } catch (error) {
    logger.writeLog({
      level: "error",
      action: "memory.state.failed",
      message: "No se pudo cargar la memoria local",
      details: { error: error.message }
    });
    res.status(500).json({ error: "No pude cargar la memoria local." });
  }
});

app.get("/api/memory/search", (req, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    res.json({
      query,
      results: query ? memoryEngine.searchMemory(query) : []
    });
  } catch (error) {
    logger.writeLog({
      level: "error",
      action: "memory.search.failed",
      message: "No se pudo buscar en la memoria local",
      details: { error: error.message }
    });
    res.status(500).json({ error: "No pude buscar en la memoria local." });
  }
});

app.post("/api/memory", (req, res) => {
  try {
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    const result = memoryEngine.saveMemory(text);

    logger.writeLog({
      level: "info",
      action: "memory.create",
      message: result.added ? "Recuerdo guardado" : "Recuerdo existente actualizado",
      details: {
        memoryId: result.memory.id,
        added: result.added
      }
    });

    res.json({
      ok: true,
      added: result.added,
      memory: result.memory,
      memoryState: memoryEngine.getMemoryState(),
      state: buildState()
    });
  } catch (error) {
    handleMemoryError(res, error, "memory.create.denied");
  }
});

app.put("/api/memory/:id", (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    const result = memoryEngine.updateMemory(id, text);

    logger.writeLog({
      level: "info",
      action: "memory.update",
      message: "Recuerdo editado",
      details: {
        memoryId: result.memory.id
      }
    });

    res.json({
      ok: true,
      memory: result.memory,
      memoryState: memoryEngine.getMemoryState(),
      state: buildState()
    });
  } catch (error) {
    handleMemoryError(res, error, "memory.update.denied");
  }
});

app.delete("/api/memory/:id", (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const result = memoryEngine.deleteMemory(id);

    logger.writeLog({
      level: "info",
      action: "memory.delete",
      message: "Recuerdo borrado",
      details: {
        requestedId: id,
        deletedCount: result.deleted.length
      }
    });

    res.json({
      ok: true,
      deleted: result.deleted,
      memoryState: memoryEngine.getMemoryState(),
      state: buildState()
    });
  } catch (error) {
    handleMemoryError(res, error, "memory.delete.denied");
  }
});

app.get("/api/memory/export", (req, res) => {
  try {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "SAW Local",
      memory: memoryEngine.getMemoryState()
    };
    const fileName = `atenea-local-memory-${new Date().toISOString().slice(0, 10)}.json`;

    logger.writeLog({
      level: "info",
      action: "memory.export",
      message: "Memoria exportada por el usuario",
      details: {
        memories: payload.memory.stats.memoryCount
      }
    });

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    logger.writeLog({
      level: "error",
      action: "memory.export.failed",
      message: "No se pudo exportar la memoria",
      details: { error: error.message }
    });
    res.status(500).json({ error: "No pude exportar la memoria local." });
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
    const confirmSensitive = req.body.confirmSensitive === true;

    if (!text) {
      return res.status(400).json({ error: "El ejemplo no puede estar vacio." });
    }

    if (!localAI.VALID_INTENTS.has(intent)) {
      return res.status(400).json({ error: "La intencion seleccionada no esta permitida." });
    }

    const sensitivity = detectSensitiveText(text);
    if (sensitivity.sensitive && !confirmSensitive) {
      logger.writeLog({
        level: "warn",
        action: "ai.learn.sensitive_warning",
        message: "Ejemplo sensible detectado antes de aprender",
        details: {
          intent,
          findingTypes: sensitivity.findings.map((finding) => finding.type),
          textLength: text.length
        }
      });

      return res.status(409).json(buildSensitiveWarning(sensitivity));
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
        backup: learnResult.backup?.name || null,
        sensitiveConfirmed: sensitivity.sensitive && confirmSensitive,
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

app.get("/api/ai/examples", (req, res) => {
  try {
    res.json({
      dataset: localAI.getTrainingDataset(),
      intents: localAI.listIntents(),
      status: localAI.getModelStatus()
    });
  } catch (error) {
    logger.writeLog({
      level: "error",
      action: "ai.examples.failed",
      message: "No se pudieron listar los ejemplos",
      details: { error: error.message }
    });
    res.status(500).json({ error: "No pude listar los ejemplos del dataset." });
  }
});

app.put("/api/ai/examples/:id", (req, res) => {
  try {
    const exampleId = String(req.params.id || "").trim();
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    const intent = typeof req.body.intent === "string" ? req.body.intent.trim() : "";
    const confirmSensitive = req.body.confirmSensitive === true;

    if (!exampleId) {
      return res.status(400).json({ error: "Falta el ID del ejemplo." });
    }

    if (!text) {
      return res.status(400).json({ error: "El ejemplo no puede estar vacio." });
    }

    if (intent && !localAI.VALID_INTENTS.has(intent)) {
      return res.status(400).json({ error: "La intencion seleccionada no esta permitida." });
    }

    const sensitivity = detectSensitiveText(text);
    if (sensitivity.sensitive && !confirmSensitive) {
      logger.writeLog({
        level: "warn",
        action: "ai.example.update.sensitive_warning",
        message: "Ejemplo sensible detectado antes de editar",
        details: {
          exampleId,
          intent: intent || null,
          findingTypes: sensitivity.findings.map((finding) => finding.type),
          textLength: text.length
        }
      });

      return res.status(409).json(buildSensitiveWarning(sensitivity));
    }

    const updateResult = localAI.updateTrainingExample(exampleId, { text, intent });
    const model = localAI.trainAndSave();

    logger.writeLog({
      level: "info",
      action: "ai.example.update",
      message: "Ejemplo del dataset editado y modelo reentrenado",
      details: {
        exampleId,
        newExampleId: updateResult.example.id,
        intent: updateResult.example.intent,
        backup: updateResult.backup.name,
        sensitiveConfirmed: sensitivity.sensitive && confirmSensitive,
        examples: model.examples.length
      }
    });

    res.json({
      ok: true,
      example: updateResult.example,
      status: localAI.getModelStatus(),
      state: buildState()
    });
  } catch (error) {
    logger.writeLog({
      level: "warn",
      action: "ai.example.update.denied",
      message: "No se pudo editar el ejemplo",
      details: { error: error.message }
    });
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/ai/examples/:id", (req, res) => {
  try {
    const exampleId = String(req.params.id || "").trim();
    if (!exampleId) {
      return res.status(400).json({ error: "Falta el ID del ejemplo." });
    }

    const deleteResult = localAI.deleteTrainingExample(exampleId);
    const model = localAI.trainAndSave();

    logger.writeLog({
      level: "info",
      action: "ai.example.delete",
      message: "Ejemplo del dataset borrado y modelo reentrenado",
      details: {
        exampleId,
        intent: deleteResult.example.intent,
        backup: deleteResult.backup.name,
        examples: model.examples.length
      }
    });

    res.json({
      ok: true,
      deleted: true,
      status: localAI.getModelStatus(),
      state: buildState()
    });
  } catch (error) {
    logger.writeLog({
      level: "warn",
      action: "ai.example.delete.denied",
      message: "No se pudo borrar el ejemplo",
      details: { error: error.message }
    });
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/ai/dataset/export", (req, res) => {
  try {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "SAW Local",
      dataset: localAI.loadTrainingData()
    };
    const fileName = `atenea-local-dataset-${new Date().toISOString().slice(0, 10)}.json`;

    logger.writeLog({
      level: "info",
      action: "ai.dataset.export",
      message: "Dataset exportado por el usuario",
      details: {
        examples: localAI.getTrainingDataset().totalExamples
      }
    });

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    logger.writeLog({
      level: "error",
      action: "ai.dataset.export.failed",
      message: "No se pudo exportar el dataset",
      details: { error: error.message }
    });
    res.status(500).json({ error: "No pude exportar el dataset." });
  }
});

app.post("/api/ai/dataset/restore-base", (req, res) => {
  try {
    const restoreResult = localAI.restoreBaseTrainingData();
    const model = localAI.trainAndSave();

    logger.writeLog({
      level: "info",
      action: "ai.dataset.restore_base",
      message: "Dataset base restaurado y modelo reentrenado",
      details: {
        backup: restoreResult.backup.name,
        examples: model.examples.length
      }
    });

    res.json({
      ok: true,
      restored: true,
      status: localAI.getModelStatus(),
      state: buildState()
    });
  } catch (error) {
    logger.writeLog({
      level: "error",
      action: "ai.dataset.restore_base.failed",
      message: "No se pudo restaurar el dataset base",
      details: { error: error.message }
    });
    res.status(500).json({ error: "No pude restaurar el dataset base." });
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

app.get("/api/conversation/intents", (req, res) => {
  try {
    res.json({
      intents: conversationAI.listConversationIntents(),
      status: conversationAI.getModelStatus()
    });
  } catch (error) {
    logger.writeLog({
      level: "error",
      action: "conversation.intents.failed",
      message: "No se pudieron listar intenciones conversacionales",
      details: { error: error.message }
    });
    res.status(500).json({ error: "No pude listar las intenciones conversacionales." });
  }
});

app.post("/api/conversation/learn", (req, res) => {
  try {
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    const intent = typeof req.body.intent === "string" ? req.body.intent.trim() : "";
    const responseText = typeof req.body.response === "string" ? req.body.response.trim() : "";
    const confirmSensitive = req.body.confirmSensitive === true;

    if (!text) {
      return res.status(400).json({ error: "El ejemplo conversacional no puede estar vacio." });
    }

    if (!responseText) {
      return res.status(400).json({ error: "La respuesta conversacional no puede estar vacia." });
    }

    const allowedIntents = new Set(conversationAI.listConversationIntents().map((item) => item.id));
    if (!allowedIntents.has(intent) || intent === "unknown") {
      return res.status(400).json({ error: "La intencion conversacional seleccionada no esta permitida." });
    }

    const sensitivity = mergeSensitivity([detectSensitiveText(text), detectSensitiveText(responseText)]);
    if (sensitivity.sensitive && !confirmSensitive) {
      logger.writeLog({
        level: "warn",
        action: "conversation.learn.sensitive_warning",
        message: "Texto sensible detectado antes de aprender respuesta conversacional",
        details: {
          intent,
          findingTypes: sensitivity.findings.map((finding) => finding.type),
          textLength: text.length,
          responseLength: responseText.length
        }
      });

      return res.status(409).json(buildSensitiveWarning(sensitivity));
    }

    const learnResult = conversationAI.addConversationExample(intent, text, responseText);
    const model = conversationAI.trainAndSave();

    logger.writeLog({
      level: "info",
      action: "conversation.learn",
      message: "Respuesta conversacional aprendida y modelo reentrenado",
      details: {
        intent,
        addedExample: learnResult.addedExample,
        addedResponse: learnResult.addedResponse,
        sensitiveConfirmed: sensitivity.sensitive && confirmSensitive,
        examples: model.examples.length,
        responses: model.responseCount
      }
    });

    res.json({
      ok: true,
      intent,
      addedExample: learnResult.addedExample,
      addedResponse: learnResult.addedResponse,
      status: conversationAI.getModelStatus(),
      state: buildState()
    });
  } catch (error) {
    logger.writeLog({
      level: "warn",
      action: "conversation.learn.denied",
      message: "No se pudo aprender la respuesta conversacional",
      details: { error: error.message }
    });
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/conversation/train", (req, res) => {
  try {
    const model = conversationAI.trainAndSave();
    logger.writeLog({
      level: "info",
      action: "conversation.train",
      message: "Modelo conversacional reentrenado manualmente",
      details: {
        examples: model.examples.length,
        intents: model.intents.length,
        responses: model.responseCount
      }
    });
    res.json({ ok: true, status: conversationAI.getModelStatus(), state: buildState() });
  } catch (error) {
    logger.writeLog({
      level: "error",
      action: "conversation.train.failed",
      message: "No se pudo reentrenar el modelo conversacional",
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
    conversation: conversationAI.getModelStatus(),
    conversationIntents: conversationAI.listConversationIntents(),
    userMemory: memoryEngine.getMemoryState(),
    settings: permissions.getSettings(),
    memory: memory.getMemory(),
    logs: logger.getRecentLogs(30),
    actions: actions.listActions()
  };
}

function handleMemoryError(res, error, action) {
  const isSensitive = error.code === "SENSITIVE_MEMORY";
  logger.writeLog({
    level: isSensitive ? "warn" : "error",
    action,
    message: error.message,
    details: {
      findingTypes: (error.findings || []).map((finding) => finding.type)
    }
  });

  res.status(isSensitive ? 400 : 400).json({
    error: isSensitive ? "No guardo recuerdos con datos sensibles." : error.message,
    findings: error.findings || []
  });
}

function buildSensitiveWarning(sensitivity) {
  return {
    error: "El ejemplo parece contener datos sensibles.",
    requiresConfirmation: true,
    warning: "Se detecto texto sensible. Podes cancelar o confirmar igualmente si estas seguro.",
    findings: sensitivity.findings
  };
}

function mergeSensitivity(results) {
  const findings = [];
  const seen = new Set();

  for (const result of results) {
    for (const finding of result.findings || []) {
      if (!seen.has(finding.type)) {
        seen.add(finding.type);
        findings.push(finding);
      }
    }
  }

  return {
    sensitive: findings.length > 0,
    findings
  };
}

module.exports = app;
