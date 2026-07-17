const express = require("express");
const path = require("path");

const { handleMessage, runStoredCommands } = require("./src/agent");
const actions = require("./src/actions");
const conversationAI = require("./src/conversationAI");
const evaluation = require("./src/evaluateLocalAI");
const favorites = require("./src/favorites");
const fileManager = require("./src/fileManager");
const logger = require("./src/logger");
const localAI = require("./src/localAI");
const memory = require("./src/memory");
const memoryEngine = require("./src/memoryEngine");
const permissions = require("./src/permissions");
const routines = require("./src/routines");
const scheduler = require("./src/scheduler");
const suggestions = require("./src/suggestions");
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

app.post("/api/ai/evaluate", (req, res) => {
  try {
    const report = evaluation.evaluate();
    logger.writeLog({
      level: "info",
      action: "ai.evaluate",
      message: "Comprension local evaluada sin ejecutar acciones",
      details: {
        total: report.total,
        correct: report.correct,
        failures: report.failures,
        accuracy: report.accuracy,
        ambiguous: report.ambiguous
      }
    });
    res.json({ ok: true, evaluation: report, state: buildState() });
  } catch (error) {
    logger.writeLog({
      level: "error",
      action: "ai.evaluate.failed",
      message: "No se pudo evaluar la comprension local",
      details: { error: error.message }
    });
    res.status(500).json({ error: "No pude evaluar la comprension local." });
  }
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

app.get("/api/conversations", (req, res) => {
  res.json({
    activeConversationId: memory.getMemory().activeConversationId,
    conversations: memory.listConversations()
  });
});

app.get("/api/conversations/search", (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limit = Number(req.query.limit || 20);
  const results = memory.searchConversations(query, { limit });
  logger.writeLog({
    level: "info",
    action: "conversation_history.search",
    message: "Historial local consultado",
    details: { queryLength: query.length, resultCount: results.length }
  });
  res.json({ query, results });
});

app.post("/api/conversations", (req, res) => {
  try {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const conversation = memory.createConversation(title);
    logger.writeLog({
      level: "info",
      action: "conversation_history.create",
      message: "Conversacion local creada",
      details: { conversationId: conversation.id }
    });
    res.status(201).json({ ok: true, conversation, state: buildState() });
  } catch (error) {
    handleConversationError(res, error, "conversation_history.create.denied");
  }
});

app.post("/api/conversations/:id/activate", (req, res) => {
  try {
    const current = memory.activateConversation(String(req.params.id || "").trim());
    logger.writeLog({
      level: "info",
      action: "conversation_history.activate",
      message: "Conversacion local activada",
      details: { conversationId: current.activeConversationId }
    });
    res.json({ ok: true, state: buildState() });
  } catch (error) {
    handleConversationError(res, error, "conversation_history.activate.denied");
  }
});

app.put("/api/conversations/:id", (req, res) => {
  try {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const conversation = memory.renameConversation(String(req.params.id || "").trim(), title);
    logger.writeLog({
      level: "info",
      action: "conversation_history.rename",
      message: "Conversacion local renombrada",
      details: { conversationId: conversation.id }
    });
    res.json({ ok: true, conversation, state: buildState() });
  } catch (error) {
    handleConversationError(res, error, "conversation_history.rename.denied");
  }
});

app.delete("/api/conversations/:id", (req, res) => {
  if (req.body?.confirm !== true) {
    return res.status(409).json({
      error: "Borrar una conversacion necesita confirmacion explicita.",
      requiresConfirmation: true
    });
  }

  try {
    const result = memory.deleteConversation(String(req.params.id || "").trim());
    logger.writeLog({
      level: "warn",
      action: "conversation_history.delete",
      message: "Conversacion local borrada con confirmacion",
      details: { conversationId: result.deleted.id, messageCount: result.deleted.messageCount }
    });
    res.json({ ok: true, deleted: result.deleted, state: buildState() });
  } catch (error) {
    handleConversationError(res, error, "conversation_history.delete.denied");
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

app.get("/api/favorites", (req, res) => {
  logger.writeLog({ level: "info", action: "favorite.list", message: "Favoritos locales listados" });
  res.json({ favorites: favorites.listFavorites(), state: buildState() });
});

app.post("/api/favorites", (req, res) => {
  try {
    const favorite = favorites.createFavorite({
      name: typeof req.body.name === "string" ? req.body.name.trim() : "",
      command: typeof req.body.command === "string" ? req.body.command.trim() : ""
    });
    logger.writeLog({
      level: "info",
      action: "favorite.create",
      message: "Favorito local creado desde la interfaz",
      details: { favoriteId: favorite.id, actionType: favorite.actionType }
    });
    res.status(201).json({ ok: true, favorite, state: buildState() });
  } catch (error) {
    handleProductivityError(res, error, "favorite.create.denied");
  }
});

app.delete("/api/favorites/:id", (req, res) => {
  try {
    const favorite = favorites.deleteFavorite(String(req.params.id || "").trim());
    logger.writeLog({
      level: "info",
      action: "favorite.delete",
      message: "Favorito local borrado",
      details: { favoriteId: favorite.id }
    });
    res.json({ ok: true, favorite, state: buildState() });
  } catch (error) {
    handleProductivityError(res, error, "favorite.delete.denied");
  }
});

app.post("/api/favorites/:id/run", async (req, res) => {
  try {
    const favorite = favorites.findFavorite(String(req.params.id || "").trim());
    if (!favorite) throw new Error("No encontre ese favorito.");
    logger.writeLog({
      level: "info",
      action: "favorite.run.requested",
      message: "Ejecucion de favorito solicitada",
      details: { favoriteId: favorite.id, actionType: favorite.actionType }
    });
    const result = await runStoredCommands([favorite.command], {
      source: "favorite",
      sourceId: favorite.id,
      sourceName: favorite.name
    });
    res.json({ ok: true, result, state: buildState() });
  } catch (error) {
    handleProductivityError(res, error, "favorite.run.denied");
  }
});

app.get("/api/favorites/export", (req, res) => {
  logger.writeLog({ level: "info", action: "favorite.export", message: "Favoritos locales exportados" });
  sendJsonDownload(res, "atenea-local-favorites", {
    exportedAt: new Date().toISOString(),
    app: "SAW Local",
    favorites: favorites.getState()
  });
});

app.get("/api/routines", (req, res) => {
  logger.writeLog({ level: "info", action: "routine.list", message: "Rutinas locales listadas" });
  res.json({ routines: routines.listRoutines(), state: buildState() });
});

app.post("/api/routines", (req, res) => {
  try {
    const commands = Array.isArray(req.body.commands)
      ? req.body.commands.map((command) => String(command || "").trim())
      : [];
    const routine = routines.createRoutine({
      name: typeof req.body.name === "string" ? req.body.name.trim() : "",
      commands
    });
    logger.writeLog({
      level: "info",
      action: "routine.create",
      message: "Rutina local creada desde la interfaz",
      details: { routineId: routine.id, steps: routine.steps.length }
    });
    res.status(201).json({ ok: true, routine, state: buildState() });
  } catch (error) {
    handleProductivityError(res, error, "routine.create.denied");
  }
});

app.delete("/api/routines/:id", (req, res) => {
  try {
    const routine = routines.deleteRoutine(String(req.params.id || "").trim());
    logger.writeLog({
      level: "info",
      action: "routine.delete",
      message: "Rutina local borrada",
      details: { routineId: routine.id }
    });
    res.json({ ok: true, routine, state: buildState() });
  } catch (error) {
    handleProductivityError(res, error, "routine.delete.denied");
  }
});

app.post("/api/routines/:id/run", async (req, res) => {
  try {
    const routine = routines.findRoutine(String(req.params.id || "").trim());
    if (!routine) throw new Error("No encontre esa rutina.");
    logger.writeLog({
      level: "info",
      action: "routine.run.requested",
      message: "Ejecucion de rutina solicitada",
      details: { routineId: routine.id, steps: routine.steps.length }
    });
    const result = await runStoredCommands(routine.steps.map((step) => step.command), {
      source: "routine",
      sourceId: routine.id,
      sourceName: routine.name
    });
    res.json({ ok: true, result, state: buildState() });
  } catch (error) {
    handleProductivityError(res, error, "routine.run.denied");
  }
});

app.get("/api/routines/export", (req, res) => {
  logger.writeLog({ level: "info", action: "routine.export", message: "Rutinas locales exportadas" });
  sendJsonDownload(res, "atenea-local-routines", {
    exportedAt: new Date().toISOString(),
    app: "SAW Local",
    routines: routines.getState()
  });
});

app.get("/api/scheduled-tasks", (req, res) => {
  res.json({ scheduledTasks: scheduler.listScheduledTasks(), state: buildState() });
});

app.post("/api/scheduled-tasks", (req, res) => {
  try {
    const task = scheduler.createScheduledTask({
      name: typeof req.body.name === "string" ? req.body.name.trim() : "",
      command: typeof req.body.command === "string" ? req.body.command.trim() : "",
      runAt: req.body.runAt,
      repeat: req.body.repeat,
      autoRun: req.body.autoRun === true
    });
    logger.writeLog({
      level: "info",
      action: "schedule.create",
      message: "Tarea local programada sin ejecutar acciones",
      details: {
        taskId: task.id,
        actionType: task.actionType,
        autoRun: task.autoRun,
        repeat: task.repeat
      }
    });
    res.status(201).json({ ok: true, task, state: buildState() });
  } catch (error) {
    handleProductivityError(res, error, "schedule.create.denied");
  }
});

app.put("/api/scheduled-tasks/:id", (req, res) => {
  try {
    const allowedKeys = ["name", "command", "runAt", "repeat", "autoRun", "enabled"];
    const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowedKeys.includes(key)));
    const task = scheduler.updateScheduledTask(String(req.params.id || "").trim(), patch);
    logger.writeLog({
      level: "info",
      action: "schedule.update",
      message: "Tarea programada actualizada sin ejecutar acciones",
      details: { taskId: task.id, changedKeys: Object.keys(patch) }
    });
    res.json({ ok: true, task, state: buildState() });
  } catch (error) {
    handleProductivityError(res, error, "schedule.update.denied");
  }
});

app.delete("/api/scheduled-tasks/:id", (req, res) => {
  if (req.body?.confirm !== true) {
    return res.status(409).json({
      error: "Borrar una tarea programada necesita confirmacion explicita.",
      requiresConfirmation: true
    });
  }

  try {
    const task = scheduler.deleteScheduledTask(String(req.params.id || "").trim());
    logger.writeLog({
      level: "info",
      action: "schedule.delete",
      message: "Tarea programada borrada con confirmacion",
      details: { taskId: task.id, actionType: task.actionType }
    });
    res.json({ ok: true, task, state: buildState() });
  } catch (error) {
    handleProductivityError(res, error, "schedule.delete.denied");
  }
});

app.post("/api/scheduled-tasks/:id/run", async (req, res) => {
  try {
    const task = scheduler.findScheduledTask(String(req.params.id || "").trim());
    if (!task) throw new Error("No encontre esa tarea programada.");
    logger.writeLog({
      level: "info",
      action: "schedule.run.requested",
      message: "Ejecucion manual de tarea programada solicitada",
      details: { taskId: task.id, actionType: task.actionType }
    });
    const result = await runStoredCommands([task.command], {
      source: "schedule",
      sourceId: task.id,
      sourceName: task.name
    });
    const outcome = scheduledRunOutcome(result);
    const updatedTask = scheduler.recordTaskRun(task.id, outcome);
    logger.writeLog({
      level: outcome === "failed" ? "warn" : "info",
      action: `schedule.run.${outcome}`,
      message: outcome === "awaiting_confirmation"
        ? "Tarea programada pausada para confirmacion"
        : outcome === "completed" ? "Tarea programada completada" : "Tarea programada detenida",
      details: { taskId: task.id, actionType: task.actionType }
    });
    res.json({ ok: true, result, task: updatedTask, state: buildState() });
  } catch (error) {
    handleProductivityError(res, error, "schedule.run.denied");
  }
});

app.get("/api/scheduled-tasks/export", (req, res) => {
  logger.writeLog({ level: "info", action: "schedule.export", message: "Agenda local exportada" });
  sendJsonDownload(res, "atenea-local-agenda", {
    exportedAt: new Date().toISOString(),
    app: "SAW Local",
    localOnly: true,
    scheduledTasks: scheduler.getState()
  });
});

app.get("/api/export/all", (req, res) => {
  logger.writeLog({
    level: "info",
    action: "local.export.all",
    message: "Exportacion local completa solicitada"
  });
  sendJsonDownload(res, "atenea-local-export", {
    exportedAt: new Date().toISOString(),
    app: "SAW Local",
    localOnly: true,
    dataset: localAI.loadTrainingData(),
    favorites: favorites.getState(),
    logs: logger.getLogs(),
    memory: memoryEngine.getMemoryState(),
    routines: routines.getState(),
    scheduledTasks: scheduler.getState(),
    settings: permissions.getSettings()
  });
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
  const server = app.listen(port, "127.0.0.1", () => {
    console.log(`SAW Local listo en http://127.0.0.1:${port}`);
  });
  scheduler.startScheduler({ execute: executeAutomaticScheduledTask });
  server.on("close", () => scheduler.stopScheduler());
}

function buildState() {
  const currentMemory = memory.getMemory();
  return {
    ai: localAI.getModelStatus(),
    evaluation: evaluation.getLastEvaluation(),
    intents: localAI.listIntents(),
    conversation: conversationAI.getModelStatus(),
    conversationIntents: conversationAI.listConversationIntents(),
    favorites: favorites.listFavorites(),
    userMemory: memoryEngine.getMemoryState(),
    settings: permissions.getSettings(),
    memory: currentMemory,
    logs: logger.getRecentLogs(30),
    routines: routines.listRoutines(),
    scheduledTasks: scheduler.listScheduledTasks(),
    actions: actions.listActions(),
    suggestions: suggestions.getSuggestions(currentMemory)
  };
}

async function executeAutomaticScheduledTask(task) {
  const result = await runStoredCommands([task.command], {
    source: "schedule",
    sourceId: task.id,
    sourceName: task.name
  });
  const outcome = scheduledRunOutcome(result);
  if (outcome !== "completed") {
    throw new Error("La ejecucion automatica no termino como una accion de solo lectura.");
  }
  return result;
}

function scheduledRunOutcome(result) {
  const lastMessage = result?.memory?.messages?.at(-1);
  const action = String(lastMessage?.meta?.action || "");
  if (action === "productivity.pending_confirmation") return "awaiting_confirmation";
  if (action.endsWith(".completed")) return "completed";
  return "failed";
}

function handleProductivityError(res, error, action) {
  logger.writeLog({
    level: "warn",
    action,
    message: error.message
  });
  res.status(400).json({ error: error.message, state: buildState() });
}

function handleConversationError(res, error, action) {
  logger.writeLog({
    level: "warn",
    action,
    message: error.message,
    details: { findingTypes: (error.findings || []).map((finding) => finding.type) }
  });
  res.status(400).json({ error: error.message, findings: error.findings || [], state: buildState() });
}

function sendJsonDownload(res, prefix, payload) {
  const fileName = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(JSON.stringify(payload, null, 2));
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
