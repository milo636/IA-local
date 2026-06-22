const state = {
  ai: {},
  actions: [],
  busy: false,
  debugMode: localStorage.getItem("sawLocalDebug") === "true",
  intents: [],
  logs: [],
  memory: { messages: [], pendingAction: null },
  settings: {}
};

const elements = {
  actionsList: document.querySelector("#actionsList"),
  aiExampleCount: document.querySelector("#aiExampleCount"),
  aiIntentCount: document.querySelector("#aiIntentCount"),
  aiLastTrained: document.querySelector("#aiLastTrained"),
  aiModelBadge: document.querySelector("#aiModelBadge"),
  chatForm: document.querySelector("#chatForm"),
  clearChatButton: document.querySelector("#clearChatButton"),
  confirmButton: document.querySelector("#confirmButton"),
  debugModeButton: document.querySelector("#debugModeButton"),
  exportLogsButton: document.querySelector("#exportLogsButton"),
  logsList: document.querySelector("#logsList"),
  messageInput: document.querySelector("#messageInput"),
  messages: document.querySelector("#messages"),
  pendingBanner: document.querySelector("#pendingBanner"),
  quickCommands: document.querySelector("#quickCommands"),
  retrainAIButton: document.querySelector("#retrainAIButton"),
  safeModeBadge: document.querySelector("#safeModeBadge"),
  sendButton: document.querySelector("#sendButton"),
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

elements.retrainAIButton.addEventListener("click", () => {
  retrainAI();
});

async function boot() {
  const response = await fetch("/api/state");
  const payload = await response.json();
  applyState(payload);

  if (!state.intents.length) {
    await refreshIntents();
  }

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

async function learnIntent(text, intent) {
  setBusy(true);
  try {
    const response = await fetch("/api/ai/learn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, intent })
    });
    const payload = await response.json();

    if (!response.ok) {
      addTransientAssistantMessage(payload.error || "No pude guardar el ejemplo.");
      return;
    }

    applyState(payload.state);
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

async function refreshIntents() {
  const response = await fetch("/api/ai/intents");
  const payload = await response.json();
  state.intents = payload.intents || [];
  state.ai = payload.status || state.ai;
  renderAiPanel();
  renderMessages();
}

function applyState(nextState) {
  state.ai = nextState.ai || state.ai || {};
  state.actions = nextState.actions || [];
  state.intents = nextState.intents || state.intents || [];
  state.logs = nextState.logs || [];
  state.memory = nextState.memory || { messages: [], pendingAction: null };
  state.settings = nextState.settings || {};

  renderAiPanel();
  renderSettings();
  renderActions();
  renderQuickCommands();
  renderMessages();
  renderLogs();
  renderPending();
  renderDebugButton();
}

function renderAiPanel() {
  const available = Boolean(state.ai.available);
  elements.aiModelBadge.textContent = available ? "Entrenado" : "Sin modelo";
  elements.aiModelBadge.className = `status-pill ${available ? "status-ok" : "status-warn"}`;
  elements.aiExampleCount.textContent = String(state.ai.exampleCount || 0);
  elements.aiIntentCount.textContent = String(state.ai.intentCount || state.intents.length || 0);
  elements.aiLastTrained.textContent = state.ai.lastTrainedAt ? formatDateTime(state.ai.lastTrainedAt) : "Nunca";
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

  debugLine.append(intent, confidence, local);
  panel.append(debugLine);

  if (meta.canLearn && meta.originalText && state.intents.length) {
    panel.append(createCorrectionForm(meta));
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
