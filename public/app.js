const state = {
  ai: {},
  actions: [],
  busy: false,
  conversation: {},
  conversationIntents: [],
  debugMode: localStorage.getItem("sawLocalDebug") === "true",
  examples: [],
  examplesFilter: "all",
  intents: [],
  logs: [],
  memory: { messages: [], pendingAction: null },
  pendingSensitive: null,
  settings: {}
};

const elements = {
  actionsList: document.querySelector("#actionsList"),
  aiExampleCount: document.querySelector("#aiExampleCount"),
  aiIntentCount: document.querySelector("#aiIntentCount"),
  aiLastTrained: document.querySelector("#aiLastTrained"),
  aiModelBadge: document.querySelector("#aiModelBadge"),
  cancelSensitiveButton: document.querySelector("#cancelSensitiveButton"),
  chatForm: document.querySelector("#chatForm"),
  clearChatButton: document.querySelector("#clearChatButton"),
  confirmButton: document.querySelector("#confirmButton"),
  confirmSensitiveButton: document.querySelector("#confirmSensitiveButton"),
  conversationLastTrained: document.querySelector("#conversationLastTrained"),
  conversationLearnedCount: document.querySelector("#conversationLearnedCount"),
  conversationModelBadge: document.querySelector("#conversationModelBadge"),
  conversationResponseCount: document.querySelector("#conversationResponseCount"),
  debugModeButton: document.querySelector("#debugModeButton"),
  examplesIntentFilter: document.querySelector("#examplesIntentFilter"),
  examplesList: document.querySelector("#examplesList"),
  exportDatasetButton: document.querySelector("#exportDatasetButton"),
  exportLogsButton: document.querySelector("#exportLogsButton"),
  logsList: document.querySelector("#logsList"),
  messageInput: document.querySelector("#messageInput"),
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
  settingsList: document.querySelector("#settingsList")
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
  "organizar descargas por tipo"
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
  addTransientAssistantMessage("Guardado cancelado. No cambie el dataset.");
});

elements.clearChatButton.addEventListener("click", async () => {
  const response = await fetch("/api/chat/clear", { method: "POST" });
  const payload = await response.json();
  applyState(payload.state);
});

elements.debugModeButton.addEventListener("click", () => {
  state.debugMode = !state.debugMode;
  localStorage.setItem("sawLocalDebug", String(state.debugMode));
  renderDebugButton();
  renderMessages();
});

elements.exportLogsButton.addEventListener("click", () => {
  window.location.href = "/api/logs/export";
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
  setBusy(true);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    const payload = await response.json();

    if (!response.ok) {
      addTransientAssistantMessage(payload.error || "Ocurrio un error local.");
      return;
    }

    applyState(payload.state);
  } catch (error) {
    addTransientAssistantMessage(`No pude contactar al servidor local: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function learnIntent(text, intent, options = {}) {
  setBusy(true);
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
      addTransientAssistantMessage(payload.error || "No pude guardar el ejemplo.");
      return;
    }

    applyState(payload.state);
    await refreshExamples();
    addTransientAssistantMessage(payload.added ? "Aprendi el ejemplo y reentrene la IA local." : "Ese ejemplo ya existia. Reentrene la IA local.");
  } catch (error) {
    addTransientAssistantMessage(`No pude entrenar la IA local: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function retrainAI() {
  setBusy(true);
  try {
    const response = await fetch("/api/ai/train", { method: "POST" });
    const payload = await response.json();

    if (!response.ok) {
      addTransientAssistantMessage(payload.error || "No pude reentrenar el modelo.");
      return;
    }

    applyState(payload.state);
    addTransientAssistantMessage("IA local reentrenada manualmente.");
  } catch (error) {
    addTransientAssistantMessage(`No pude reentrenar la IA local: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function retrainConversation() {
  setBusy(true);
  try {
    const response = await fetch("/api/conversation/train", { method: "POST" });
    const payload = await response.json();

    if (!response.ok) {
      addTransientAssistantMessage(payload.error || "No pude reentrenar la conversacion.");
      return;
    }

    applyState(payload.state);
    addTransientAssistantMessage("Modelo conversacional reentrenado.");
  } catch (error) {
    addTransientAssistantMessage(`No pude reentrenar la conversacion: ${error.message}`);
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
  setBusy(true);
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
      addTransientAssistantMessage(payload.error || "No pude aprender la respuesta.");
      return;
    }

    applyState(payload.state);
    addTransientAssistantMessage(payload.addedResponse ? "Aprendi la respuesta y reentrene la conversacion." : "Esa respuesta ya existia. Reentrene la conversacion.");
  } catch (error) {
    addTransientAssistantMessage(`No pude aprender la respuesta: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function refreshExamples() {
  try {
    const response = await fetch("/api/ai/examples");
    const payload = await response.json();

    if (!response.ok) {
      addTransientAssistantMessage(payload.error || "No pude cargar los ejemplos.");
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
  }
}

function applyState(nextState) {
  state.ai = nextState.ai || state.ai || {};
  state.actions = nextState.actions || [];
  state.conversation = nextState.conversation || state.conversation || {};
  state.conversationIntents = nextState.conversationIntents || state.conversationIntents || [];
  state.intents = nextState.intents || state.intents || [];
  state.logs = nextState.logs || [];
  state.memory = nextState.memory || { messages: [], pendingAction: null };
  state.settings = nextState.settings || {};

  renderAiPanel();
  renderConversationPanel();
  renderSettings();
  renderActions();
  renderQuickCommands();
  renderMessages();
  renderLogs();
  renderPending();
  renderDebugButton();
  renderSensitiveBanner();
  renderExamplesFilter();
  renderExamplesPanel();
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

function renderDebugButton() {
  elements.debugModeButton.setAttribute("aria-pressed", String(state.debugMode));
  elements.debugModeButton.classList.toggle("debug-active", state.debugMode);
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
    addTransientAssistantMessage(payload.error || "No pude actualizar la configuracion.");
    renderSettings();
    return;
  }

  applyState(payload.state);
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

  if (message.role === "assistant" && state.debugMode) {
    article.append(createDebugPanel(message));
  }

  return article;
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

  panel.append(debugLine);

  if (meta.canLearn && meta.originalText && state.intents.length) {
    panel.append(createCorrectionForm(meta));
  }

  if (meta.canLearnResponse && meta.originalText && state.conversationIntents.length) {
    panel.append(createConversationLearningForm(meta));
  }

  return panel;
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
  setBusy(true);
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
      addTransientAssistantMessage(payload.error || "No pude editar el ejemplo.");
      return;
    }

    applyState(payload.state);
    await refreshExamples();
    addTransientAssistantMessage("Ejemplo editado y modelo reentrenado.");
  } catch (error) {
    addTransientAssistantMessage(`No pude editar el ejemplo: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function deleteExample(id) {
  if (!window.confirm("Borrar este ejemplo del dataset local?")) return;

  setBusy(true);
  try {
    const response = await fetch(`/api/ai/examples/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
    const payload = await response.json();

    if (!response.ok) {
      addTransientAssistantMessage(payload.error || "No pude borrar el ejemplo.");
      return;
    }

    applyState(payload.state);
    await refreshExamples();
    addTransientAssistantMessage("Ejemplo borrado y modelo reentrenado.");
  } catch (error) {
    addTransientAssistantMessage(`No pude borrar el ejemplo: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function exportDataset() {
  setBusy(true);
  try {
    const response = await fetch("/api/ai/dataset/export", { method: "POST" });

    if (!response.ok) {
      const payload = await response.json();
      addTransientAssistantMessage(payload.error || "No pude exportar el dataset.");
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
    addTransientAssistantMessage("Dataset exportado.");
  } catch (error) {
    addTransientAssistantMessage(`No pude exportar el dataset: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

async function restoreBaseDataset() {
  if (!window.confirm("Restaurar el dataset base? Se creara un backup antes de cambiarlo.")) return;

  setBusy(true);
  try {
    const response = await fetch("/api/ai/dataset/restore-base", { method: "POST" });
    const payload = await response.json();

    if (!response.ok) {
      addTransientAssistantMessage(payload.error || "No pude restaurar el dataset base.");
      return;
    }

    applyState(payload.state);
    await refreshExamples();
    addTransientAssistantMessage("Dataset base restaurado y modelo reentrenado.");
  } catch (error) {
    addTransientAssistantMessage(`No pude restaurar el dataset: ${error.message}`);
  } finally {
    setBusy(false);
  }
}

function showSensitiveWarning(details) {
  state.pendingSensitive = details;
  renderSensitiveBanner();
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

function setBusy(value) {
  state.busy = value;
  elements.sendButton.disabled = value;
  elements.messageInput.disabled = value;
  elements.retrainAIButton.disabled = value;
  elements.retrainConversationButton.disabled = value;
  elements.refreshExamplesButton.disabled = value;
  elements.exportDatasetButton.disabled = value;
  elements.restoreDatasetButton.disabled = value;
  elements.confirmSensitiveButton.disabled = value;
  elements.chatForm.classList.toggle("is-busy", value);
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
