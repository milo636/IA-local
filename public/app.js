const state = {
  ai: {},
  actions: [],
  busy: false,
  conversation: {},
  conversationIntents: [],
  conversationSearch: "",
  conversationSearchResults: null,
  conversationSearchTimer: null,
  debugMode: localStorage.getItem("sawLocalDebug") === "true",
  evaluation: {},
  examples: [],
  examplesFilter: "all",
  favorites: [],
  intents: [],
  logs: [],
  memory: { messages: [], pendingAction: null },
  memorySearch: "",
  memorySearchResults: null,
  memorySearchTimer: null,
  pendingSensitive: null,
  routines: [],
  statusResetTimer: null,
  settings: {},
  suggestions: [],
  userMemory: { memories: [], profile: {}, stats: {} }
};

const elements = {
  actionsList: document.querySelector("#actionsList"),
  activityStatus: document.querySelector("#activityStatus"),
  aiExampleCount: document.querySelector("#aiExampleCount"),
  aiIntentCount: document.querySelector("#aiIntentCount"),
  aiLastTrained: document.querySelector("#aiLastTrained"),
  aiModelBadge: document.querySelector("#aiModelBadge"),
  cancelSensitiveButton: document.querySelector("#cancelSensitiveButton"),
  chatForm: document.querySelector("#chatForm"),
  clearChatButton: document.querySelector("#clearChatButton"),
  chatTitle: document.querySelector("#chatTitle"),
  confirmButton: document.querySelector("#confirmButton"),
  confirmSensitiveButton: document.querySelector("#confirmSensitiveButton"),
  conversationLastTrained: document.querySelector("#conversationLastTrained"),
  conversationLearnedCount: document.querySelector("#conversationLearnedCount"),
  conversationModelBadge: document.querySelector("#conversationModelBadge"),
  conversationResponseCount: document.querySelector("#conversationResponseCount"),
  conversationSelect: document.querySelector("#conversationSelect"),
  conversationSearchInput: document.querySelector("#conversationSearchInput"),
  conversationsList: document.querySelector("#conversationsList"),
  createFavoriteButton: document.querySelector("#createFavoriteButton"),
  createRoutineButton: document.querySelector("#createRoutineButton"),
  debugModeButton: document.querySelector("#debugModeButton"),
  examplesIntentFilter: document.querySelector("#examplesIntentFilter"),
  examplesList: document.querySelector("#examplesList"),
  exportDatasetButton: document.querySelector("#exportDatasetButton"),
  exportAllButton: document.querySelector("#exportAllButton"),
  exportFavoritesButton: document.querySelector("#exportFavoritesButton"),
  exportLogsButton: document.querySelector("#exportLogsButton"),
  exportMemoryButton: document.querySelector("#exportMemoryButton"),
  exportRoutinesButton: document.querySelector("#exportRoutinesButton"),
  evaluateAIButton: document.querySelector("#evaluateAIButton"),
  favoriteCommand: document.querySelector("#favoriteCommand"),
  favoriteCount: document.querySelector("#favoriteCount"),
  favoriteForm: document.querySelector("#favoriteForm"),
  favoriteName: document.querySelector("#favoriteName"),
  favoritesList: document.querySelector("#favoritesList"),
  logsList: document.querySelector("#logsList"),
  addMemoryButton: document.querySelector("#addMemoryButton"),
  memoryBadge: document.querySelector("#memoryBadge"),
  memoryCount: document.querySelector("#memoryCount"),
  memoryForm: document.querySelector("#memoryForm"),
  memoryInput: document.querySelector("#memoryInput"),
  memoryList: document.querySelector("#memoryList"),
  memorySearchInput: document.querySelector("#memorySearchInput"),
  memoryUpdatedAt: document.querySelector("#memoryUpdatedAt"),
  messageInput: document.querySelector("#messageInput"),
  newConversationButton: document.querySelector("#newConversationButton"),
  messages: document.querySelector("#messages"),
  pendingBanner: document.querySelector("#pendingBanner"),
  quickCommands: document.querySelector("#quickCommands"),
  refreshExamplesButton: document.querySelector("#refreshExamplesButton"),
  retrainAIButton: document.querySelector("#retrainAIButton"),
  retrainConversationButton: document.querySelector("#retrainConversationButton"),
  restoreDatasetButton: document.querySelector("#restoreDatasetButton"),
  safeModeBadge: document.querySelector("#safeModeBadge"),
  sendButton: document.querySelector("#sendButton"),
  sensitiveBanner: document.querySelector("#sensitiveBanner"),
  sensitiveWarningText: document.querySelector("#sensitiveWarningText"),
  settingsList: document.querySelector("#settingsList"),
  suggestionsBar: document.querySelector("#suggestionsBar"),
  profileStatus: document.querySelector("#profileStatus"),
  profileSummary: document.querySelector("#profileSummary"),
  productivityBadge: document.querySelector("#productivityBadge"),
  routineCommands: document.querySelector("#routineCommands"),
  routineCount: document.querySelector("#routineCount"),
  routineForm: document.querySelector("#routineForm"),
  routineName: document.querySelector("#routineName"),
  routinesList: document.querySelector("#routinesList"),
  saveLastCommandButton: document.querySelector("#saveLastCommandButton"),
  toastRegion: document.querySelector("#toastRegion"),
  understandingAccuracy: document.querySelector("#understandingAccuracy"),
  understandingAmbiguous: document.querySelector("#understandingAmbiguous"),
  understandingBadge: document.querySelector("#understandingBadge"),
  understandingCorrect: document.querySelector("#understandingCorrect"),
  understandingErrors: document.querySelector("#understandingErrors"),
  understandingEvaluatedAt: document.querySelector("#understandingEvaluatedAt"),
  understandingFailures: document.querySelector("#understandingFailures")
};

const permissionLabels = {
  safeMode: "Modo seguro",
  allowOpenApps: "Abrir apps",
  allowFileRead: "Leer archivos",
  allowFileWrite: "Crear o mover",
  allowDelete: "Borrar",
  allowShellCommands: "Shell",
  allowNetwork: "Red"
};

const editableSettings = new Set(["safeMode", "allowOpenApps", "allowFileRead", "allowFileWrite"]);

const quickCommands = [
  "ayuda",
  "abrir bloc de notas",
  "abrir explorador",
  "listar archivos de descargas",
  "mostrar estado del sistema",
  "organizar descargas por tipo",
  "mostrar favoritos",
  "mostrar rutinas"
];

elements.chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = elements.messageInput.value.trim();
  if (!message || state.busy) return;

  elements.messageInput.value = "";
  await sendMessage(message);
});

elements.confirmButton.addEventListener("click", () => {
  sendMessage("CONFIRMAR");
});

elements.confirmSensitiveButton.addEventListener("click", () => {
  confirmSensitiveSave();
});

elements.cancelSensitiveButton.addEventListener("click", () => {
  state.pendingSensitive = null;
  renderSensitiveBanner();
  showToast("Guardado cancelado. No cambie el dataset.", "info");
});

elements.clearChatButton.addEventListener("click", async () => {
  if (state.busy) return;
  if (!window.confirm("Borrar los mensajes de esta conversacion local?")) return;
  setBusy(true, "Limpiando conversacion...");
  try {
    const response = await fetch("/api/chat/clear", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No pude limpiar la conversacion.");
    applyState(payload.state);
    showToast("Chat limpio.", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setBusy(false);
  }
});

elements.newConversationButton.addEventListener("click", () => {
  createConversation();
});

elements.conversationSelect.addEventListener("change", () => {
  activateConversation(elements.conversationSelect.value);
});

elements.conversationSearchInput.addEventListener("input", () => {
  state.conversationSearch = elements.conversationSearchInput.value.trim();
  clearTimeout(state.conversationSearchTimer);
  if (state.conversationSearch.length < 2) {
    state.conversationSearchResults = [];
    renderConversations();
    return;
  }
  state.conversationSearchTimer = setTimeout(searchConversationHistory, 220);
});

elements.debugModeButton.addEventListener("click", () => {
  state.debugMode = !state.debugMode;
  localStorage.setItem("sawLocalDebug", String(state.debugMode));
  renderDebugButton();
  renderMessages();
  showToast(state.debugMode ? "Debug activo." : "Debug desactivado.", "info");
});

elements.exportLogsButton.addEventListener("click", () => {
  window.location.href = "/api/logs/export";
});

elements.exportMemoryButton.addEventListener("click", () => {
  window.location.href = "/api/memory/export";
});

elements.exportFavoritesButton.addEventListener("click", () => {
  window.location.href = "/api/favorites/export";
});

elements.exportRoutinesButton.addEventListener("click", () => {
  window.location.href = "/api/routines/export";
});

elements.exportAllButton.addEventListener("click", () => {
  window.location.href = "/api/export/all";
});

elements.saveLastCommandButton.addEventListener("click", () => {
  const lastCommand = [...(state.memory.messages || [])]
    .reverse()
    .find((message) => message.role === "user" && String(message.content || "").toUpperCase() !== "CONFIRMAR");

  if (!lastCommand) {
    showToast("Todavia no hay un comando para guardar.", "warn");
    return;
  }

  elements.favoriteCommand.value = lastCommand.content;
  showToast("Ultimo comando cargado.", "info");
});

elements.favoriteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createFavorite(elements.favoriteName.value, elements.favoriteCommand.value);
});

elements.routineForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const commands = elements.routineCommands.value.split(/\r?\n/).map((command) => command.trim()).filter(Boolean);
  await createRoutine(elements.routineName.value, commands);
});

elements.memoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addMemory(elements.memoryInput.value);
});

elements.memorySearchInput.addEventListener("input", () => {
  state.memorySearch = elements.memorySearchInput.value.trim();
  window.clearTimeout(state.memorySearchTimer);
  state.memorySearchTimer = window.setTimeout(() => {
    refreshUserMemory(state.memorySearch);
  }, 220);
});

elements.refreshExamplesButton.addEventListener("click", () => {
  refreshExamples();
});

elements.examplesIntentFilter.addEventListener("change", () => {
  state.examplesFilter = elements.examplesIntentFilter.value;
  renderExamplesPanel();
});

elements.exportDatasetButton.addEventListener("click", () => {
  exportDataset();
});

elements.restoreDatasetButton.addEventListener("click", () => {
  restoreBaseDataset();
});

elements.retrainAIButton.addEventListener("click", () => {
  retrainAI();
});

elements.retrainConversationButton.addEventListener("click", () => {
  retrainConversation();
});

elements.evaluateAIButton.addEventListener("click", () => {
  evaluateAI();
});

async function boot() {
  const response = await fetch("/api/state");
  const payload = await response.json();
  applyState(payload);

  if (!state.intents.length) {
    await refreshIntents();
  }

  if (!state.conversationIntents.length) {
    await refreshConversationIntents();
  }

  await refreshExamples();

  if (window.matchMedia("(min-width: 821px)").matches) {
    elements.messageInput.focus();
  }
}

async function sendMessage(message) {
  setBusy(true, "Procesando mensaje...");
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    const payload = await response.json();

    if (!response.ok) {
      const errorMessage = payload.error || "Ocurrio un error local.";
      addTransientAssistantMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }

    applyState(payload.state);
  } catch (error) {
    const errorMessage = `No pude contactar al servidor local: ${error.message}`;
    addTransientAssistantMessage(errorMessage);
    showToast("No pude contactar al servidor local.", "error");
  } finally {
    setBusy(false);
  }
}

async function createConversation() {
  setBusy(true, "Creando conversacion...");
  try {
    const response = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No pude crear la conversacion.");
    clearConversationSearch();
    applyState(payload.state);
    showToast("Nueva conversacion local creada.", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function activateConversation(id, messageId = null) {
  if (!id || state.busy) return;
  if (id === state.memory.activeConversationId) {
    if (messageId) highlightMessage(messageId);
    return;
  }
  setBusy(true, "Abriendo conversacion...");
  try {
    const response = await fetch(`/api/conversations/${encodeURIComponent(id)}/activate`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No pude abrir la conversacion.");
    applyState(payload.state);
    if (messageId) highlightMessage(messageId);
  } catch (error) {
    showToast(error.message, "error");
    renderConversations();
  } finally {
    setBusy(false);
  }
}

async function renameConversation(id, title) {
  const value = String(title || "").trim();
  if (!value) {
    showToast("El titulo no puede estar vacio.", "warn");
    return;
  }

  setBusy(true, "Guardando titulo...");
  try {
    const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: value })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No pude renombrar la conversacion.");
    clearConversationSearch();
    applyState(payload.state);
    showToast("Conversacion renombrada.", "success");
  } catch (error) {
    showToast(error.message, "error");
    renderConversations();
  } finally {
    setBusy(false);
  }
}

async function deleteConversation(id, title) {
  if (!window.confirm(`Borrar la conversacion "${title}" y sus mensajes locales?`)) return;
  setBusy(true, "Borrando conversacion...");
  try {
    const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No pude borrar la conversacion.");
    clearConversationSearch();
    applyState(payload.state);
    showToast("Conversacion borrada.", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function searchConversationHistory() {
  const query = state.conversationSearch.trim();
  if (query.length < 2) return;
  try {
    const response = await fetch(`/api/conversations/search?q=${encodeURIComponent(query)}&limit=30`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No pude buscar en el historial.");
    if (query !== state.conversationSearch.trim()) return;
    state.conversationSearchResults = payload.results || [];
    renderConversations();
  } catch (error) {
    showToast(error.message, "error");
  }
}

function clearConversationSearch() {
  clearTimeout(state.conversationSearchTimer);
  state.conversationSearch = "";
  state.conversationSearchResults = null;
  elements.conversationSearchInput.value = "";
}

async function learnIntent(text, intent, options = {}) {
  setBusy(true, "Entrenando modelo...");
  let modelUpdated = false;
  try {
    const response = await fetch("/api/ai/learn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, intent, confirmSensitive: options.confirmSensitive === true })
    });
    const payload = await response.json();

    if (response.status === 409 && payload.requiresConfirmation) {
      showSensitiveWarning({
        operation: "learn",
        text,
        intent,
        findings: payload.findings || [],
        warning: payload.warning
      });
      return;
    }

    if (!response.ok) {
      const errorMessage = payload.error || "No pude guardar el ejemplo.";
      addTransientAssistantMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }

    applyState(payload.state);
    await refreshExamples();
    modelUpdated = true;
    showToast(payload.added ? "Modelo actualizado." : "El ejemplo ya existia. Modelo actualizado.", "success");
  } catch (error) {
    addTransientAssistantMessage(`No pude entrenar la IA local: ${error.message}`);
    showToast("No pude entrenar la IA local.", "error");
  } finally {
    setBusy(false, modelUpdated ? "Modelo actualizado" : "Atenea esta lista");
  }
}

async function retrainAI() {
  setBusy(true, "Entrenando modelo...");
  let modelUpdated = false;
  try {
    const response = await fetch("/api/ai/train", { method: "POST" });
    const payload = await response.json();

    if (!response.ok) {
      const errorMessage = payload.error || "No pude reentrenar el modelo.";
      addTransientAssistantMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }

    applyState(payload.state);
    modelUpdated = true;
    showToast("Modelo actualizado.", "success");
  } catch (error) {
    addTransientAssistantMessage(`No pude reentrenar la IA local: ${error.message}`);
    showToast("No pude reentrenar la IA local.", "error");
  } finally {
    setBusy(false, modelUpdated ? "Modelo actualizado" : "Atenea esta lista");
  }
}

async function retrainConversation() {
  setBusy(true, "Entrenando modelo...");
  let modelUpdated = false;
  try {
    const response = await fetch("/api/conversation/train", { method: "POST" });
    const payload = await response.json();

    if (!response.ok) {
      const errorMessage = payload.error || "No pude reentrenar la conversacion.";
      addTransientAssistantMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }

    applyState(payload.state);
    modelUpdated = true;
    showToast("Modelo actualizado.", "success");
  } catch (error) {
    addTransientAssistantMessage(`No pude reentrenar la conversacion: ${error.message}`);
    showToast("No pude reentrenar la conversacion.", "error");
  } finally {
    setBusy(false, modelUpdated ? "Modelo actualizado" : "Atenea esta lista");
  }
}

async function evaluateAI() {
  setBusy(true, "Evaluando comprension...");
  try {
    const response = await fetch("/api/ai/evaluate", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      showToast(payload.error || "No pude evaluar la comprension.", "error");
      return;
    }
    applyState(payload.state);
    showToast(`Evaluacion completa: ${payload.evaluation.correct}/${payload.evaluation.total}.`, "success");
  } catch (error) {
    addTransientAssistantMessage(`No pude evaluar la comprension local: ${error.message}`);
    showToast("No pude evaluar la comprension local.", "error");
  } finally {
    setBusy(false);
  }
}

async function refreshIntents() {
  const response = await fetch("/api/ai/intents");
  const payload = await response.json();
  state.intents = payload.intents || [];
  state.ai = payload.status || state.ai;
  renderAiPanel();
  renderExamplesFilter();
  renderMessages();
}

async function refreshConversationIntents() {
  const response = await fetch("/api/conversation/intents");
  const payload = await response.json();
  state.conversationIntents = payload.intents || [];
  state.conversation = payload.status || state.conversation;
  renderConversationPanel();
  renderMessages();
}

async function learnConversationResponse(text, intent, responseText, options = {}) {
  setBusy(true, "Entrenando modelo...");
  let modelUpdated = false;
  try {
    const response = await fetch("/api/conversation/learn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        intent,
        response: responseText,
        confirmSensitive: options.confirmSensitive === true
      })
    });
    const payload = await response.json();

    if (response.status === 409 && payload.requiresConfirmation) {
      showSensitiveWarning({
        operation: "conversation",
        text,
        intent,
        responseText,
        findings: payload.findings || [],
        warning: payload.warning
      });
      return;
    }

    if (!response.ok) {
      const errorMessage = payload.error || "No pude aprender la respuesta.";
      addTransientAssistantMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }

    applyState(payload.state);
    modelUpdated = true;
    showToast(payload.addedResponse ? "Respuesta aprendida. Modelo actualizado." : "La respuesta ya existia. Modelo actualizado.", "success");
  } catch (error) {
    addTransientAssistantMessage(`No pude aprender la respuesta: ${error.message}`);
    showToast("No pude aprender la respuesta.", "error");
  } finally {
    setBusy(false, modelUpdated ? "Modelo actualizado" : "Atenea esta lista");
  }
}

async function refreshExamples() {
  try {
    const response = await fetch("/api/ai/examples");
    const payload = await response.json();

    if (!response.ok) {
      const errorMessage = payload.error || "No pude cargar los ejemplos.";
      addTransientAssistantMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }

    state.examples = payload.dataset?.examples || [];
    state.intents = payload.intents || state.intents;
    state.ai = payload.status || state.ai;
    renderAiPanel();
    renderExamplesFilter();
    renderExamplesPanel();
  } catch (error) {
    addTransientAssistantMessage(`No pude cargar los ejemplos: ${error.message}`);
    showToast("No pude cargar los ejemplos.", "error");
  }
}

async function refreshUserMemory(query = "") {
  try {
    const endpoint = query ? `/api/memory/search?q=${encodeURIComponent(query)}` : "/api/memory";
    const response = await fetch(endpoint);
    const payload = await response.json();

    if (!response.ok) {
      const errorMessage = payload.error || "No pude cargar la memoria.";
      addTransientAssistantMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }

    if (query) {
      state.memorySearchResults = payload.results || [];
    } else {
      state.userMemory = payload;
      state.memorySearchResults = null;
    }

    renderMemoryPanel();
  } catch (error) {
    addTransientAssistantMessage(`No pude cargar la memoria local: ${error.message}`);
    showToast("No pude cargar la memoria local.", "error");
  }
}

async function addMemory(text) {
  const value = String(text || "").trim();
  if (!value) {
    showToast("Escribi un recuerdo antes de guardarlo.", "warn");
    return;
  }

  setBusy(true, "Guardando recuerdo...");
  try {
    const response = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: value })
    });
    const payload = await response.json();

    if (!response.ok) {
      const errorMessage = payload.error || "No pude guardar el recuerdo.";
      addTransientAssistantMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }

    elements.memoryInput.value = "";
    state.userMemory = payload.memoryState || state.userMemory;
    state.memorySearchResults = null;
    renderMemoryPanel();
    showToast(payload.added ? "Recuerdo guardado." : "Ese recuerdo ya existia.", "success");
  } catch (error) {
    addTransientAssistantMessage(`No pude guardar el recuerdo: ${error.message}`);
    showToast("No pude guardar el recuerdo.", "error");
  } finally {
    setBusy(false);
  }
}

async function updateMemory(id, text) {
  setBusy(true, "Actualizando recuerdo...");
  try {
    const response = await fetch(`/api/memory/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    const payload = await response.json();

    if (!response.ok) {
      const errorMessage = payload.error || "No pude editar el recuerdo.";
      addTransientAssistantMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }

    state.userMemory = payload.memoryState || state.userMemory;
    state.memorySearchResults = null;
    renderMemoryPanel();
    showToast("Recuerdo editado.", "success");
  } catch (error) {
    addTransientAssistantMessage(`No pude editar el recuerdo: ${error.message}`);
    showToast("No pude editar el recuerdo.", "error");
  } finally {
    setBusy(false);
  }
}

async function deleteMemory(id) {
  if (!window.confirm("Eliminar este recuerdo local?")) return;

  setBusy(true, "Eliminando recuerdo...");
  try {
    const response = await fetch(`/api/memory/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    const payload = await response.json();

    if (!response.ok) {
      const errorMessage = payload.error || "No pude eliminar el recuerdo.";
      addTransientAssistantMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }

    state.userMemory = payload.memoryState || state.userMemory;
    state.memorySearchResults = null;
    renderMemoryPanel();
    showToast("Recuerdo eliminado.", "success");
  } catch (error) {
    addTransientAssistantMessage(`No pude eliminar el recuerdo: ${error.message}`);
    showToast("No pude eliminar el recuerdo.", "error");
  } finally {
    setBusy(false);
  }
}

async function createFavorite(name, command) {
  const value = String(command || "").trim();
  if (!value) {
    showToast("Escribi un comando permitido.", "warn");
    return;
  }

  const payload = await productivityRequest("/api/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: String(name || "").trim(), command: value })
  }, "Favorito guardado.");

  if (payload) {
    elements.favoriteName.value = "";
    elements.favoriteCommand.value = "";
  }
}

async function deleteFavorite(id) {
  if (!window.confirm("Eliminar este favorito local?")) return;
  await productivityRequest(`/api/favorites/${encodeURIComponent(id)}`, { method: "DELETE" }, "Favorito eliminado.");
}

async function runFavorite(id) {
  await productivityRequest(`/api/favorites/${encodeURIComponent(id)}/run`, { method: "POST" }, "Favorito procesado.");
}

async function createRoutine(name, commands) {
  if (!commands.length) {
    showToast("Agrega al menos un comando a la rutina.", "warn");
    return;
  }

  const payload = await productivityRequest("/api/routines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: String(name || "").trim(), commands })
  }, "Rutina guardada.");

  if (payload) {
    elements.routineName.value = "";
    elements.routineCommands.value = "";
  }
}

async function deleteRoutine(id) {
  if (!window.confirm("Eliminar esta rutina local?")) return;
  await productivityRequest(`/api/routines/${encodeURIComponent(id)}`, { method: "DELETE" }, "Rutina eliminada.");
}

async function runRoutine(id) {
  await productivityRequest(`/api/routines/${encodeURIComponent(id)}/run`, { method: "POST" }, "Rutina procesada.");
}

async function productivityRequest(endpoint, options, successMessage) {
  setBusy(true, "Procesando automatizacion...");
  try {
    const response = await fetch(endpoint, options);
    const payload = await response.json();
    if (!response.ok) {
      showToast(payload.error || "No pude procesar la automatizacion.", "error");
      return null;
    }

    applyState(payload.state || state);
    showToast(successMessage, "success");
    return payload;
  } catch (error) {
    showToast(`Error local: ${error.message}`, "error");
    return null;
  } finally {
    setBusy(false);
  }
}

function applyState(nextState) {
  state.ai = nextState.ai || state.ai || {};
  state.actions = nextState.actions || [];
  state.conversation = nextState.conversation || state.conversation || {};
  state.conversationIntents = nextState.conversationIntents || state.conversationIntents || [];
  state.evaluation = nextState.evaluation || state.evaluation || {};
  state.favorites = nextState.favorites || state.favorites || [];
  state.intents = nextState.intents || state.intents || [];
  state.logs = nextState.logs || [];
  state.memory = nextState.memory || { messages: [], pendingAction: null };
  state.routines = nextState.routines || state.routines || [];
  state.settings = nextState.settings || {};
  state.suggestions = nextState.suggestions || [];
  state.userMemory = nextState.userMemory || state.userMemory || { memories: [], profile: {}, stats: {} };

  renderAiPanel();
  renderConversationPanel();
  renderUnderstandingPanel();
  renderConversations();
  renderMemoryPanel();
  renderProductivityPanel();
  renderSettings();
  renderActions();
  renderQuickCommands();
  renderMessages();
  renderSuggestions();
  renderLogs();
  renderPending();
  renderDebugButton();
  renderSensitiveBanner();
  renderExamplesFilter();
  renderExamplesPanel();
}

function renderProductivityPanel() {
  const favorites = Array.isArray(state.favorites) ? state.favorites : [];
  const routines = Array.isArray(state.routines) ? state.routines : [];
  const hasItems = favorites.length + routines.length > 0;

  elements.favoriteCount.textContent = String(favorites.length);
  elements.routineCount.textContent = String(routines.length);
  elements.productivityBadge.textContent = hasItems ? "Lista" : "Vacio";
  elements.productivityBadge.className = `status-pill ${hasItems ? "status-ok" : "status-warn"}`;
  renderProductivityList(elements.favoritesList, favorites, "favorite");
  renderProductivityList(elements.routinesList, routines, "routine");
}

function renderConversations() {
  const conversations = Array.isArray(state.memory.conversations) ? state.memory.conversations : [];
  const activeId = state.memory.activeConversationId;
  const active = conversations.find((item) => item.id === activeId);
  elements.chatTitle.textContent = active?.title || state.memory.activeConversationTitle || "Conversacion local";

  elements.conversationSelect.replaceChildren();
  conversations.forEach((conversation) => {
    const option = document.createElement("option");
    option.value = conversation.id;
    option.textContent = conversation.title;
    option.selected = conversation.id === activeId;
    elements.conversationSelect.append(option);
  });

  elements.conversationsList.replaceChildren();
  if (state.conversationSearch) {
    renderConversationSearchResults();
    return;
  }

  conversations.forEach((conversation) => {
    const item = document.createElement("article");
    item.className = `conversation-item${conversation.id === activeId ? " active" : ""}`;

    const open = document.createElement("button");
    open.type = "button";
    open.className = "conversation-open";
    open.disabled = state.busy;
    open.setAttribute("aria-label", `Abrir conversacion ${conversation.title}`);
    open.addEventListener("click", () => activateConversation(conversation.id));

    const title = document.createElement("strong");
    title.textContent = conversation.title;
    const meta = document.createElement("span");
    meta.textContent = `${conversation.messageCount} mensajes · ${formatDateTime(conversation.updatedAt)}`;
    open.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "conversation-actions";
    const edit = createConversationIconButton("Editar titulo", "edit");
    edit.disabled = state.busy;
    edit.addEventListener("click", () => showConversationRename(item, conversation));
    const remove = createConversationIconButton("Borrar conversacion", "trash");
    remove.classList.add("conversation-delete");
    remove.disabled = state.busy;
    remove.addEventListener("click", () => deleteConversation(conversation.id, conversation.title));
    actions.append(edit, remove);

    item.append(open, actions);
    elements.conversationsList.append(item);
  });
}

function renderConversationSearchResults() {
  const results = Array.isArray(state.conversationSearchResults) ? state.conversationSearchResults : [];
  if (state.conversationSearch.length < 2 || !results.length) {
    const empty = document.createElement("p");
    empty.className = "conversation-search-empty";
    empty.textContent = state.conversationSearch.length < 2
      ? "Escribi al menos 2 caracteres."
      : "No encontre mensajes con ese texto.";
    elements.conversationsList.append(empty);
    return;
  }

  results.forEach((result) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "conversation-search-result";
    button.disabled = state.busy;
    button.addEventListener("click", () => activateConversation(result.conversationId, result.messageId));

    const title = document.createElement("strong");
    title.textContent = result.conversationTitle;
    const snippet = document.createElement("span");
    snippet.textContent = result.snippet;
    const meta = document.createElement("small");
    meta.textContent = `${result.role === "user" ? "Vos" : "SAW Local"} · ${formatDateTime(result.timestamp)}`;
    button.append(title, snippet, meta);
    elements.conversationsList.append(button);
  });
}

function showConversationRename(container, conversation) {
  const form = document.createElement("form");
  form.className = "conversation-rename-form";
  const input = document.createElement("input");
  input.value = conversation.title;
  input.maxLength = 60;
  input.setAttribute("aria-label", "Nuevo titulo de la conversacion");
  const save = createConversationIconButton("Guardar titulo", "check");
  save.type = "submit";
  const cancel = createConversationIconButton("Cancelar edicion", "close");
  cancel.addEventListener("click", renderConversations);
  form.append(input, save, cancel);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    renameConversation(conversation.id, input.value);
  });
  container.replaceChildren(form);
  input.focus();
  input.select();
}

function createConversationIconButton(label, icon) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "conversation-icon-button";
  button.title = label;
  button.setAttribute("aria-label", label);
  const paths = {
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>'
  };
  button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24">${paths[icon]}</svg>`;
  return button;
}

function renderProductivityList(container, items, type) {
  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "log-message";
    empty.textContent = type === "favorite" ? "Sin favoritos guardados." : "Sin rutinas guardadas.";
    container.append(empty);
    return;
  }

  items.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "productivity-item";
    const heading = document.createElement("div");
    heading.className = "productivity-item-heading";
    const title = document.createElement("strong");
    title.textContent = entry.name;
    const detail = document.createElement("span");
    detail.textContent = type === "favorite"
      ? entry.command
      : `${entry.steps.length} acciones: ${entry.steps.map((step) => step.command).join(" | ")}`;
    heading.append(title, detail);

    const actions = document.createElement("div");
    actions.className = "productivity-item-actions";
    const run = document.createElement("button");
    run.type = "button";
    run.className = "learn-button";
    run.textContent = "Ejecutar";
    run.addEventListener("click", () => type === "favorite" ? runFavorite(entry.id) : runRoutine(entry.id));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-button icon-button";
    remove.textContent = "Eliminar";
    remove.addEventListener("click", () => type === "favorite" ? deleteFavorite(entry.id) : deleteRoutine(entry.id));
    actions.append(run, remove);
    item.append(heading, actions);
    container.append(item);
  });
}

function renderMemoryPanel() {
  const memoryState = state.userMemory || { memories: [], profile: {}, stats: {} };
  const memories = Array.isArray(memoryState.memories) ? memoryState.memories : [];
  const stats = memoryState.stats || {};
  const profile = memoryState.profile || {};
  const visibleMemories = Array.isArray(state.memorySearchResults) ? state.memorySearchResults : memories;
  const hasMemories = memories.length > 0;

  elements.memoryBadge.textContent = hasMemories ? "Activa" : "Sin recuerdos";
  elements.memoryBadge.className = `status-pill ${hasMemories ? "status-ok" : "status-warn"}`;
  elements.memoryCount.textContent = String(stats.memoryCount ?? memories.length);
  elements.memoryUpdatedAt.textContent = stats.updatedAt ? formatDateTime(stats.updatedAt) : "Nunca";
  elements.profileStatus.textContent = profile.preferredBrowser || profile.favoriteFolders?.length ? "Personalizado" : "Basico";

  renderProfileSummary(profile);
  renderMemoryList(visibleMemories, Boolean(state.memorySearch));
}

function renderProfileSummary(profile) {
  elements.profileSummary.replaceChildren();

  const rows = [
    ["Navegador", profile.preferredBrowser || "Sin definir"],
    ["Tema", profile.preferredTheme || "Sin definir"],
    ["Carpetas", profile.favoriteFolders?.length ? profile.favoriteFolders.join(", ") : "Sin definir"]
  ];

  rows.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "profile-row";
    const key = document.createElement("span");
    key.textContent = label;
    const text = document.createElement("strong");
    text.textContent = value;
    row.append(key, text);
    elements.profileSummary.append(row);
  });
}

function renderMemoryList(memories, isSearch) {
  elements.memoryList.replaceChildren();

  if (!memories.length) {
    const empty = document.createElement("p");
    empty.className = "log-message";
    empty.textContent = isSearch ? "Sin recuerdos para esa busqueda." : "Sin recuerdos guardados.";
    elements.memoryList.append(empty);
    return;
  }

  memories.forEach((item) => {
    const memory = item.memory || item;
    elements.memoryList.append(createMemoryNode(memory, item.score, item.type || "memory"));
  });
}

function createMemoryNode(memory, score, type = "memory") {
  const item = document.createElement("article");
  item.className = "memory-item";
  const editable = type !== "profile" && Boolean(memory.id);

  const top = document.createElement("div");
  top.className = "example-top";

  const title = document.createElement("strong");
  title.textContent = editable
    ? (score ? `Coincidencia ${formatPercent(score)}` : "Recuerdo")
    : "Dato del perfil";

  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = formatDateTime(memory.updatedAt || memory.createdAt);

  top.append(title, time);

  const textarea = document.createElement("textarea");
  textarea.value = memory.text;
  textarea.maxLength = 500;
  textarea.rows = 3;
  textarea.readOnly = !editable;
  textarea.setAttribute("aria-label", "Editar recuerdo");

  const actions = document.createElement("div");
  actions.className = "example-actions";

  if (editable) {
    const save = document.createElement("button");
    save.type = "button";
    save.className = "learn-button";
    save.textContent = "Editar recuerdo";
    save.addEventListener("click", () => updateMemory(memory.id, textarea.value));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-button icon-button";
    remove.textContent = "Eliminar";
    remove.addEventListener("click", () => deleteMemory(memory.id));

    actions.append(save, remove);
  }

  item.append(top, textarea);
  if (editable) item.append(actions);
  return item;
}

function renderAiPanel() {
  const available = Boolean(state.ai.available);
  elements.aiModelBadge.textContent = available ? "Entrenado" : "Sin modelo";
  elements.aiModelBadge.className = `status-pill ${available ? "status-ok" : "status-warn"}`;
  elements.aiExampleCount.textContent = String(state.ai.exampleCount || 0);
  elements.aiIntentCount.textContent = String(state.ai.intentCount || state.intents.length || 0);
  elements.aiLastTrained.textContent = state.ai.lastTrainedAt ? formatDateTime(state.ai.lastTrainedAt) : "Nunca";
}

function renderConversationPanel() {
  const available = Boolean(state.conversation.available);
  elements.conversationModelBadge.textContent = available ? "Entrenado" : "Sin modelo";
  elements.conversationModelBadge.className = `status-pill ${available ? "status-ok" : "status-warn"}`;
  elements.conversationResponseCount.textContent = String(state.conversation.responseCount || 0);
  elements.conversationLearnedCount.textContent = String(state.conversation.learnedResponseCount || 0);
  elements.conversationLastTrained.textContent = state.conversation.lastTrainedAt ? formatDateTime(state.conversation.lastTrainedAt) : "Nunca";
}

function renderUnderstandingPanel() {
  const report = state.evaluation || {};
  const evaluated = Boolean(report.evaluatedAt);
  const healthy = evaluated && Number(report.accuracy || 0) >= 0.8;
  elements.understandingBadge.textContent = evaluated ? (healthy ? "Evaluada" : "Revisar") : "Sin evaluar";
  elements.understandingBadge.className = `status-pill ${healthy ? "status-ok" : "status-warn"}`;
  elements.understandingAccuracy.textContent = formatPercent(report.accuracy || 0);
  elements.understandingCorrect.textContent = `${report.correct || 0} / ${report.total || 0}`;
  elements.understandingFailures.textContent = String(report.failures || 0);
  elements.understandingAmbiguous.textContent = String(report.ambiguous || 0);
  elements.understandingEvaluatedAt.textContent = evaluated ? formatDateTime(report.evaluatedAt) : "Nunca";

  elements.understandingErrors.replaceChildren();
  const errors = Array.isArray(report.errors) ? report.errors.slice(0, 4) : [];
  if (!evaluated || !errors.length) {
    const empty = document.createElement("p");
    empty.className = "evaluation-empty";
    empty.textContent = evaluated ? "Sin errores recientes." : "Ejecuta una evaluacion local.";
    elements.understandingErrors.append(empty);
    return;
  }

  errors.forEach((error) => {
    const item = document.createElement("div");
    item.className = "evaluation-error";
    const text = document.createElement("strong");
    text.textContent = error.text;
    const detail = document.createElement("span");
    detail.textContent = `${error.expectedIntent} -> ${error.detectedIntent}`;
    item.append(text, detail);
    elements.understandingErrors.append(item);
  });
}

function renderDebugButton() {
  elements.debugModeButton.setAttribute("aria-pressed", String(state.debugMode));
  elements.debugModeButton.classList.toggle("debug-active", state.debugMode);
  const label = elements.debugModeButton.querySelector("span");
  if (label) label.textContent = state.debugMode ? "Debug activo" : "Modo debug";
}

function renderSettings() {
  elements.settingsList.replaceChildren();
  elements.safeModeBadge.textContent = state.settings.safeMode ? "Activo" : "Inactivo";
  elements.safeModeBadge.className = `status-pill ${state.settings.safeMode ? "status-ok" : "status-warn"}`;

  Object.entries(permissionLabels).forEach(([key, label]) => {
    const row = document.createElement("label");
    row.className = "setting-row";

    const text = document.createElement("span");
    text.textContent = label;

    const switchWrap = document.createElement("span");
    switchWrap.className = "switch";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(state.settings[key]);
    input.disabled = !editableSettings.has(key);
    input.setAttribute("aria-label", label);
    input.addEventListener("change", () => updateSetting(key, input.checked));

    const slider = document.createElement("span");
    slider.className = "slider";

    switchWrap.append(input, slider);
    row.append(text, switchWrap);
    elements.settingsList.append(row);
  });
}

async function updateSetting(key, value) {
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [key]: value })
  });
  const payload = await response.json();

  if (!response.ok) {
    const errorMessage = payload.error || "No pude actualizar la configuracion.";
    addTransientAssistantMessage(errorMessage);
    showToast(errorMessage, "error");
    renderSettings();
    return;
  }

  applyState(payload.state);
  showToast("Configuracion actualizada.", "success");
}

function renderActions() {
  elements.actionsList.replaceChildren();
  state.actions.forEach((action) => {
    const item = document.createElement("div");
    item.className = "action-item";

    const title = document.createElement("strong");
    title.textContent = action.label;

    const desc = document.createElement("span");
    desc.textContent = action.description;

    item.append(title, desc);
    elements.actionsList.append(item);
  });
}

function renderQuickCommands() {
  elements.quickCommands.replaceChildren();
  quickCommands.forEach((command) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-command";
    button.textContent = command;
    button.addEventListener("click", () => sendMessage(command));
    elements.quickCommands.append(button);
  });
}

function renderSuggestions() {
  const suggestions = Array.isArray(state.suggestions) ? state.suggestions : [];
  elements.suggestionsBar.replaceChildren();
  elements.suggestionsBar.hidden = suggestions.length === 0;
  suggestions.forEach((suggestion) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-button";
    button.textContent = suggestion.label;
    button.title = suggestion.reason || "Enviar como mensaje";
    button.disabled = state.busy;
    button.addEventListener("click", () => sendMessage(suggestion.text));
    elements.suggestionsBar.append(button);
  });
}

function renderMessages() {
  elements.messages.replaceChildren();
  const messages = state.memory.messages || [];

  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const wrap = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "Listo para comandos locales";
    const text = document.createElement("span");
    text.textContent = "Proba con ayuda, listar archivos de descargas o mostrar estado del sistema.";
    wrap.append(title, text);
    empty.append(wrap);
    elements.messages.append(empty);
    return;
  }

  messages.forEach((message) => {
    elements.messages.append(createMessageNode(message));
  });
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function createMessageNode(message) {
  const article = document.createElement("article");
  article.className = `message ${message.role === "user" ? "user" : "assistant"}`;
  if (message.id) article.dataset.messageId = message.id;

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const role = document.createElement("span");
  role.textContent = message.role === "user" ? "Vos" : "SAW Local";

  const time = document.createElement("span");
  time.textContent = formatTime(message.timestamp);

  const content = document.createElement("p");
  content.className = "message-content";
  content.textContent = message.content;

  meta.append(role, time);
  article.append(meta, content);

  if (message.role === "assistant") {
    article.append(createMessageActions(message));
  }

  if (message.role === "assistant" && state.debugMode) {
    article.append(createDebugPanel(message));
  }

  return article;
}

function highlightMessage(messageId) {
  const target = [...elements.messages.querySelectorAll("[data-message-id]")]
    .find((node) => node.dataset.messageId === String(messageId));
  if (!target) return;
  elements.messages.querySelectorAll(".search-highlight").forEach((node) => node.classList.remove("search-highlight"));
  target.classList.add("search-highlight");
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => target.classList.remove("search-highlight"), 1800);
}

function createMessageActions(message) {
  const actions = document.createElement("div");
  actions.className = "message-actions";

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "copy-button";
  copy.title = "Copiar respuesta";
  copy.setAttribute("aria-label", "Copiar respuesta");
  copy.innerHTML = `
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="9" y="9" width="13" height="13" rx="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
    <span>Copiar</span>
  `;
  copy.addEventListener("click", () => copyText(message.content || ""));

  actions.append(copy);
  return actions;
}

function createDebugPanel(message) {
  const meta = message.meta || {};
  const panel = document.createElement("div");
  panel.className = "message-debug";

  const debugLine = document.createElement("div");
  debugLine.className = "debug-line";

  const intent = document.createElement("span");
  intent.textContent = `Intencion: ${meta.detectedIntent || "sin IA"}`;

  const confidence = document.createElement("span");
  confidence.textContent = `Confidence: ${formatPercent(meta.confidence)}`;

  const local = document.createElement("span");
  local.textContent = meta.usedLocalAI ? "IA local: si" : "IA local: no";

  const domain = document.createElement("span");
  domain.textContent = `Modo: ${meta.aiDomain || "sistema"}`;

  debugLine.append(intent, confidence, local, domain);

  if (meta.aiDomain === "conversation") {
    const origin = document.createElement("span");
    origin.textContent = `Origen: ${meta.responseOrigin || "base"}`;
    debugLine.append(origin);
  }

  if (meta.secondIntent) appendDebugChip(debugLine, `Segunda: ${meta.secondIntent} (${formatPercent(meta.secondConfidence)})`);
  if (Number.isFinite(Number(meta.margin))) appendDebugChip(debugLine, `Margen: ${formatPercent(meta.margin)}`);
  if (Array.isArray(meta.relevantWords) && meta.relevantWords.length) appendDebugChip(debugLine, `Palabras: ${meta.relevantWords.join(", ")}`);
  if (meta.entities && Object.keys(meta.entities).length) {
    appendDebugChip(debugLine, `Entidades: ${Object.entries(meta.entities).map(([key, value]) => `${key}=${value}`).join(", ")}`);
  }
  if (Array.isArray(meta.contextUsed) && meta.contextUsed.length) appendDebugChip(debugLine, `Contexto: ${meta.contextUsed.join(", ")}`);
  if (meta.fallbackReason) appendDebugChip(debugLine, `Fallback: ${meta.fallbackReason}`);
  if (meta.ambiguous) appendDebugChip(debugLine, "Resultado ambiguo");
  if (meta.requiresClarification) appendDebugChip(debugLine, "Falta una entidad");
  if (meta.requiresConfirmation) appendDebugChip(debugLine, "Requiere confirmacion");

  panel.append(debugLine);

  if (meta.canLearn && meta.originalText && state.intents.length) {
    panel.append(createCorrectionForm(meta));
  }

  if (meta.canLearnResponse && meta.originalText && state.conversationIntents.length) {
    panel.append(createConversationLearningForm(meta));
  }

  return panel;
}

function appendDebugChip(container, text) {
  const chip = document.createElement("span");
  chip.textContent = text;
  container.append(chip);
}

function createCorrectionForm(meta) {
  const wrapper = document.createElement("div");
  wrapper.className = "correction-box";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "correction-toggle";
  toggle.textContent = "Corregir intencion";

  const form = document.createElement("form");
  form.className = "correction-form";
  form.hidden = true;

  const select = document.createElement("select");
  select.setAttribute("aria-label", "Seleccionar intencion correcta");

  state.intents.forEach((intent) => {
    const option = document.createElement("option");
    option.value = intent.id;
    option.textContent = `${intent.label} (${intent.id})`;
    select.append(option);
  });

  if (meta.detectedIntent && state.intents.some((intent) => intent.id === meta.detectedIntent)) {
    select.value = meta.detectedIntent;
  }

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "learn-button";
  submit.textContent = "Guardar ejemplo";

  form.append(select, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await learnIntent(meta.originalText, select.value);
  });

  toggle.addEventListener("click", () => {
    form.hidden = !form.hidden;
  });

  wrapper.append(toggle, form);
  return wrapper;
}

function createConversationLearningForm(meta) {
  const wrapper = document.createElement("div");
  wrapper.className = "correction-box";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "correction-toggle";
  toggle.textContent = "Aprender respuesta";

  const form = document.createElement("form");
  form.className = "conversation-learn-form";
  form.hidden = true;

  const select = document.createElement("select");
  select.setAttribute("aria-label", "Seleccionar intencion conversacional");

  state.conversationIntents
    .filter((intent) => intent.id !== "unknown")
    .forEach((intent) => {
      const option = document.createElement("option");
      option.value = intent.id;
      option.textContent = `${intent.label} (${intent.id})`;
      select.append(option);
    });

  if (meta.detectedIntent && state.conversationIntents.some((intent) => intent.id === meta.detectedIntent && intent.id !== "unknown")) {
    select.value = meta.detectedIntent;
  }

  const response = document.createElement("textarea");
  response.rows = 3;
  response.maxLength = 500;
  response.placeholder = "Escribi la respuesta correcta...";
  response.setAttribute("aria-label", "Nueva respuesta conversacional");

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "learn-button";
  submit.textContent = "Guardar respuesta";

  form.append(select, response, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await learnConversationResponse(meta.originalText, select.value, response.value);
  });

  toggle.addEventListener("click", () => {
    form.hidden = !form.hidden;
  });

  wrapper.append(toggle, form);
  return wrapper;
}

function renderExamplesFilter() {
  const currentValue = state.examplesFilter;
  elements.examplesIntentFilter.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "Todas las intenciones";
  elements.examplesIntentFilter.append(allOption);

  state.intents.forEach((intent) => {
    const option = document.createElement("option");
    option.value = intent.id;
    option.textContent = `${intent.label} (${intent.exampleCount})`;
    elements.examplesIntentFilter.append(option);
  });

  elements.examplesIntentFilter.value = state.intents.some((intent) => intent.id === currentValue) ? currentValue : "all";
  state.examplesFilter = elements.examplesIntentFilter.value;
}

function renderExamplesPanel() {
  elements.examplesList.replaceChildren();

  const examples = state.examplesFilter === "all"
    ? state.examples
    : state.examples.filter((example) => example.intent === state.examplesFilter);

  if (!examples.length) {
    const empty = document.createElement("p");
    empty.className = "log-message";
    empty.textContent = "Sin ejemplos para mostrar.";
    elements.examplesList.append(empty);
    return;
  }

  examples.forEach((example) => {
    elements.examplesList.append(createExampleNode(example));
  });
}

function createExampleNode(example) {
  const item = document.createElement("article");
  item.className = "example-item";

  const top = document.createElement("div");
  top.className = "example-top";

  const label = document.createElement("strong");
  label.textContent = example.label || example.intent;

  const badge = document.createElement("span");
  badge.className = `status-pill ${example.isBase ? "status-ok" : "status-warn"}`;
  badge.textContent = example.isBase ? "Base" : "Aprendido";

  top.append(label, badge);

  const textarea = document.createElement("textarea");
  textarea.value = example.text;
  textarea.maxLength = 500;
  textarea.rows = 3;
  textarea.setAttribute("aria-label", `Editar ejemplo ${example.intent}`);

  const select = document.createElement("select");
  select.setAttribute("aria-label", "Intencion del ejemplo");
  state.intents.forEach((intent) => {
    const option = document.createElement("option");
    option.value = intent.id;
    option.textContent = intent.label;
    select.append(option);
  });
  select.value = example.intent;

  const actions = document.createElement("div");
  actions.className = "example-actions";

  const save = document.createElement("button");
  save.type = "button";
  save.className = "learn-button";
  save.textContent = "Guardar";
  save.addEventListener("click", () => {
    updateExample(example.id, textarea.value, select.value);
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger-button icon-button";
  remove.textContent = "Borrar";
  remove.addEventListener("click", () => {
    deleteExample(example.id);
  });

  actions.append(save, remove);
  item.append(top, textarea, select, actions);
  return item;
}

async function updateExample(id, text, intent, options = {}) {
  setBusy(true, "Actualizando dataset...");
  let modelUpdated = false;
  try {
    const response = await fetch(`/api/ai/examples/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, intent, confirmSensitive: options.confirmSensitive === true })
    });
    const payload = await response.json();

    if (response.status === 409 && payload.requiresConfirmation) {
      showSensitiveWarning({
        operation: "edit",
        id,
        text,
        intent,
        findings: payload.findings || [],
        warning: payload.warning
      });
      return;
    }

    if (!response.ok) {
      const errorMessage = payload.error || "No pude editar el ejemplo.";
      addTransientAssistantMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }

    applyState(payload.state);
    await refreshExamples();
    modelUpdated = true;
    showToast("Ejemplo editado. Modelo actualizado.", "success");
  } catch (error) {
    addTransientAssistantMessage(`No pude editar el ejemplo: ${error.message}`);
    showToast("No pude editar el ejemplo.", "error");
  } finally {
    setBusy(false, modelUpdated ? "Modelo actualizado" : "Atenea esta lista");
  }
}

async function deleteExample(id) {
  if (!window.confirm("Borrar este ejemplo del dataset local?")) return;

  setBusy(true, "Actualizando dataset...");
  let modelUpdated = false;
  try {
    const response = await fetch(`/api/ai/examples/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    const payload = await response.json();

    if (!response.ok) {
      const errorMessage = payload.error || "No pude borrar el ejemplo.";
      addTransientAssistantMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }

    applyState(payload.state);
    await refreshExamples();
    modelUpdated = true;
    showToast("Ejemplo borrado. Modelo actualizado.", "success");
  } catch (error) {
    addTransientAssistantMessage(`No pude borrar el ejemplo: ${error.message}`);
    showToast("No pude borrar el ejemplo.", "error");
  } finally {
    setBusy(false, modelUpdated ? "Modelo actualizado" : "Atenea esta lista");
  }
}

async function exportDataset() {
  setBusy(true, "Exportando dataset...");
  try {
    const response = await fetch("/api/ai/dataset/export", { method: "POST" });

    if (!response.ok) {
      const payload = await response.json();
      const errorMessage = payload.error || "No pude exportar el dataset.";
      addTransientAssistantMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `atenea-local-dataset-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Dataset exportado.", "success");
  } catch (error) {
    addTransientAssistantMessage(`No pude exportar el dataset: ${error.message}`);
    showToast("No pude exportar el dataset.", "error");
  } finally {
    setBusy(false);
  }
}

async function restoreBaseDataset() {
  if (!window.confirm("Restaurar el dataset base? Se creara un backup antes de cambiarlo.")) return;

  setBusy(true, "Restaurando dataset...");
  let modelUpdated = false;
  try {
    const response = await fetch("/api/ai/dataset/restore-base", { method: "POST" });
    const payload = await response.json();

    if (!response.ok) {
      const errorMessage = payload.error || "No pude restaurar el dataset base.";
      addTransientAssistantMessage(errorMessage);
      showToast(errorMessage, "error");
      return;
    }

    applyState(payload.state);
    await refreshExamples();
    modelUpdated = true;
    showToast("Dataset base restaurado. Modelo actualizado.", "success");
  } catch (error) {
    addTransientAssistantMessage(`No pude restaurar el dataset: ${error.message}`);
    showToast("No pude restaurar el dataset.", "error");
  } finally {
    setBusy(false, modelUpdated ? "Modelo actualizado" : "Atenea esta lista");
  }
}

function showSensitiveWarning(details) {
  state.pendingSensitive = details;
  renderSensitiveBanner();
  showToast("Texto sensible detectado. Revisa antes de guardar.", "warn");
}

async function confirmSensitiveSave() {
  const pending = state.pendingSensitive;
  if (!pending) return;

  state.pendingSensitive = null;
  renderSensitiveBanner();

  if (pending.operation === "learn") {
    await learnIntent(pending.text, pending.intent, { confirmSensitive: true });
    return;
  }

  if (pending.operation === "edit") {
    await updateExample(pending.id, pending.text, pending.intent, { confirmSensitive: true });
    return;
  }

  if (pending.operation === "conversation") {
    await learnConversationResponse(pending.text, pending.intent, pending.responseText, { confirmSensitive: true });
  }
}

function renderSensitiveBanner() {
  const pending = state.pendingSensitive;
  elements.sensitiveBanner.hidden = !pending;

  if (!pending) {
    elements.sensitiveWarningText.textContent = "";
    return;
  }

  const labels = (pending.findings || []).map((finding) => finding.label).join(", ");
  elements.sensitiveWarningText.textContent = labels
    ? `${pending.warning || "Se detecto texto sensible."} Hallazgos: ${labels}.`
    : pending.warning || "Se detecto texto sensible.";
}

function renderLogs() {
  elements.logsList.replaceChildren();

  if (!state.logs.length) {
    const empty = document.createElement("p");
    empty.className = "log-message";
    empty.textContent = "Sin logs todavia.";
    elements.logsList.append(empty);
    return;
  }

  state.logs.forEach((log) => {
    const item = document.createElement("article");
    item.className = "log-item";

    const top = document.createElement("div");
    top.className = "log-top";

    const action = document.createElement("span");
    action.className = "log-action";
    action.textContent = log.action || "system";

    const level = document.createElement("span");
    level.className = `log-level level-${log.level || "info"}`;
    level.textContent = log.level || "info";

    const message = document.createElement("p");
    message.className = "log-message";
    message.textContent = log.message || "";

    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = formatTime(log.timestamp);

    top.append(action, level);
    item.append(top, message, time);
    elements.logsList.append(item);
  });
}

function renderPending() {
  elements.pendingBanner.hidden = !state.memory.pendingAction;
}

function addTransientAssistantMessage(content) {
  const message = {
    meta: {
      canLearn: false,
      confidence: 0,
      detectedIntent: null,
      usedLocalAI: false
    },
    role: "assistant",
    content,
    timestamp: new Date().toISOString()
  };
  elements.messages.append(createMessageNode(message));
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

function setBusy(value, label = value ? "Procesando..." : "Atenea esta lista") {
  state.busy = value;
  elements.sendButton.disabled = value;
  elements.messageInput.disabled = value;
  elements.clearChatButton.disabled = value;
  elements.retrainAIButton.disabled = value;
  elements.retrainConversationButton.disabled = value;
  elements.newConversationButton.disabled = value;
  elements.conversationSelect.disabled = value;
  elements.conversationSearchInput.disabled = value;
  elements.suggestionsBar.querySelectorAll("button").forEach((button) => {
    button.disabled = value;
  });
  elements.evaluateAIButton.disabled = value;
  elements.refreshExamplesButton.disabled = value;
  elements.exportDatasetButton.disabled = value;
  elements.restoreDatasetButton.disabled = value;
  elements.addMemoryButton.disabled = value;
  elements.exportMemoryButton.disabled = value;
  elements.exportFavoritesButton.disabled = value;
  elements.exportRoutinesButton.disabled = value;
  elements.exportAllButton.disabled = value;
  elements.createFavoriteButton.disabled = value;
  elements.createRoutineButton.disabled = value;
  elements.saveLastCommandButton.disabled = value;
  elements.favoriteName.disabled = value;
  elements.favoriteCommand.disabled = value;
  elements.routineName.disabled = value;
  elements.routineCommands.disabled = value;
  elements.memoryInput.disabled = value;
  elements.memorySearchInput.disabled = value;
  elements.confirmSensitiveButton.disabled = value;
  elements.chatForm.classList.toggle("is-busy", value);
  elements.sendButton.classList.toggle("loading", value);

  const sendLabel = elements.sendButton.querySelector("span");
  if (sendLabel) sendLabel.textContent = value ? "Enviando..." : "Enviar";

  if (value) {
    window.clearTimeout(state.statusResetTimer);
    updateActivityStatus(label, "working");
  } else {
    const updated = label === "Modelo actualizado";
    updateActivityStatus(label, updated ? "updated" : "ready");
    window.clearTimeout(state.statusResetTimer);
    if (updated) {
      state.statusResetTimer = window.setTimeout(() => {
        updateActivityStatus("Atenea esta lista", "ready");
      }, 2600);
    }
  }
  renderConversations();
}

function updateActivityStatus(text, mode = "ready") {
  if (!elements.activityStatus) return;
  const label = elements.activityStatus.querySelector("span:last-child");
  if (label) label.textContent = text;
  elements.activityStatus.classList.toggle("status-working", mode === "working");
  elements.activityStatus.classList.toggle("status-updated", mode === "updated");
  elements.activityStatus.classList.toggle("status-ready", mode === "ready");
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    showToast("Respuesta copiada.", "success");
  } catch {
    showToast("No pude copiar la respuesta.", "error");
  }
}

function showToast(message, type = "info") {
  if (!elements.toastRegion) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  elements.toastRegion.append(toast);

  window.setTimeout(() => {
    toast.classList.add("toast-hide");
    window.setTimeout(() => toast.remove(), 180);
  }, 3200);
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatPercent(value) {
  const number = Number(value || 0);
  return `${Math.round(number * 100)}%`;
}

boot();
