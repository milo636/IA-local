const { DATA_FILES, DEFAULT_MEMORY, readJson, writeJson } = require("./fileManager");
const { detectSensitiveText } = require("./sensitiveText");

const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES = 200;
const MAX_TITLE_LENGTH = 60;
const MAX_SEARCH_RESULTS = 50;
const MAX_SEARCH_QUERY_LENGTH = 200;

function getMemory() {
  const state = loadState();
  return activeMemoryView(state);
}

function listConversations() {
  return loadState().conversations.map(conversationSummary);
}

function searchConversations(query, options = {}) {
  const rawQuery = compactText(query, MAX_SEARCH_QUERY_LENGTH);
  if (rawQuery.length < 2) return [];

  const normalizedQuery = normalizeSearchText(rawQuery);
  const queryTokens = tokenizeSearch(normalizedQuery);
  if (!normalizedQuery || !queryTokens.length) return [];

  const requestedLimit = Number(options.limit || 20);
  const limit = Math.min(MAX_SEARCH_RESULTS, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 20));
  const state = loadState();
  const results = [];

  for (const conversation of state.conversations) {
    for (const message of conversation.messages) {
      const normalizedContent = normalizeSearchText(message.content);
      const score = searchScore(normalizedContent, normalizedQuery, queryTokens);
      if (score <= 0) continue;
      results.push({
        conversationId: conversation.id,
        conversationTitle: conversation.title,
        messageId: message.id,
        role: message.role === "user" ? "user" : "assistant",
        snippet: searchSnippet(message.content, rawQuery),
        timestamp: message.timestamp,
        score
      });
    }
  }

  return results
    .sort((left, right) => right.score - left.score || String(right.timestamp).localeCompare(String(left.timestamp)))
    .slice(0, limit);
}

function createConversation(title = "") {
  const state = loadState();
  if (state.conversations.length >= MAX_CONVERSATIONS) {
    throw new Error(`Solo se permiten ${MAX_CONVERSATIONS} conversaciones locales.`);
  }

  const timestamp = new Date().toISOString();
  const customTitle = String(title || "").trim();
  const conversation = {
    id: createId("chat"),
    title: customTitle ? validateTitle(customTitle) : nextConversationTitle(state.conversations),
    titleSource: customTitle ? "user" : "auto",
    messages: [],
    pendingAction: null,
    pendingClarification: null,
    commandContext: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  state.conversations.unshift(conversation);
  state.activeConversationId = conversation.id;
  persistState(state);
  return conversationSummary(conversation);
}

function activateConversation(id) {
  const state = loadState();
  const conversation = findConversation(state, id);
  state.activeConversationId = conversation.id;
  persistState(state);
  return activeMemoryView(state);
}

function renameConversation(id, title) {
  const state = loadState();
  const conversation = findConversation(state, id);
  conversation.title = validateTitle(title);
  conversation.titleSource = "user";
  conversation.updatedAt = new Date().toISOString();
  persistState(state);
  return conversationSummary(conversation);
}

function deleteConversation(id) {
  const state = loadState();
  const conversation = findConversation(state, id);
  state.conversations = state.conversations.filter((item) => item.id !== conversation.id);

  if (!state.conversations.length) {
    const replacement = emptyConversation("Conversacion principal");
    state.conversations.push(replacement);
    state.activeConversationId = replacement.id;
  } else if (state.activeConversationId === conversation.id) {
    state.activeConversationId = state.conversations[0].id;
  }

  persistState(state);
  return {
    deleted: conversationSummary(conversation),
    memory: activeMemoryView(state)
  };
}

function addMessage(role, content, meta = {}) {
  const state = loadState();
  const conversation = getActiveConversation(state);
  const message = {
    id: createId("msg"),
    role,
    content,
    meta,
    timestamp: new Date().toISOString()
  };

  conversation.messages.push(message);
  conversation.messages = conversation.messages.slice(-MAX_MESSAGES);
  conversation.updatedAt = message.timestamp;

  if (role === "user" && conversation.titleSource === "auto" && countUserMessages(conversation.messages) === 1) {
    conversation.title = titleFromMessage(content);
  }

  persistState(state);
  return activeMemoryView(state);
}

function setPendingAction(pendingAction) {
  updateActiveConversation((conversation) => {
    conversation.pendingAction = pendingAction;
  });
  return pendingAction;
}

function getPendingAction() {
  return getMemory().pendingAction;
}

function clearPendingAction() {
  updateActiveConversation((conversation) => {
    conversation.pendingAction = null;
  });
}

function setPendingClarification(pendingClarification) {
  updateActiveConversation((conversation) => {
    conversation.pendingClarification = pendingClarification;
  });
  return pendingClarification;
}

function getPendingClarification() {
  return getMemory().pendingClarification;
}

function clearPendingClarification() {
  updateActiveConversation((conversation) => {
    conversation.pendingClarification = null;
  });
}

function setCommandContext(commandContext) {
  updateActiveConversation((conversation) => {
    conversation.commandContext = commandContext;
  });
  return commandContext;
}

function getCommandContext() {
  return getMemory().commandContext;
}

function clearCommandContext() {
  updateActiveConversation((conversation) => {
    conversation.commandContext = null;
  });
}

function clearMessages() {
  updateActiveConversation((conversation) => {
    conversation.messages = [];
    conversation.pendingAction = null;
    conversation.pendingClarification = null;
    conversation.commandContext = null;
    conversation.updatedAt = new Date().toISOString();
  });
}

function saveMemory(value) {
  updateActiveConversation((conversation) => {
    conversation.messages = Array.isArray(value.messages) ? value.messages.slice(-MAX_MESSAGES) : [];
    conversation.pendingAction = value.pendingAction || null;
    conversation.pendingClarification = value.pendingClarification || null;
    conversation.commandContext = value.commandContext || null;
    conversation.updatedAt = new Date().toISOString();
  });
}

function loadState() {
  return normalizeState(readJson(DATA_FILES.memory, DEFAULT_MEMORY));
}

function normalizeState(raw) {
  if (Array.isArray(raw?.conversations) && raw.conversations.length) {
    const conversations = raw.conversations
      .map(normalizeConversation)
      .filter(Boolean)
      .slice(0, MAX_CONVERSATIONS);
    if (conversations.length) {
      const activeExists = conversations.some((item) => item.id === raw.activeConversationId);
      return {
        version: 2,
        activeConversationId: activeExists ? raw.activeConversationId : conversations[0].id,
        conversations
      };
    }
  }

  const legacyMessages = Array.isArray(raw?.messages) ? raw.messages.slice(-MAX_MESSAGES) : [];
  const timestamp = legacyMessages[0]?.timestamp || new Date().toISOString();
  const lastTimestamp = legacyMessages.at(-1)?.timestamp || timestamp;
  const firstUserMessage = legacyMessages.find((message) => message.role === "user")?.content;
  const conversation = {
    id: "chat-main",
    title: firstUserMessage ? titleFromMessage(firstUserMessage) : "Conversacion principal",
    titleSource: "auto",
    messages: legacyMessages,
    pendingAction: raw?.pendingAction || null,
    pendingClarification: raw?.pendingClarification || null,
    commandContext: raw?.commandContext || null,
    createdAt: timestamp,
    updatedAt: lastTimestamp
  };
  return { version: 2, activeConversationId: conversation.id, conversations: [conversation] };
}

function normalizeConversation(value) {
  if (!value || typeof value !== "object") return null;
  const id = String(value.id || "").trim();
  if (!id) return null;
  const messages = Array.isArray(value.messages) ? value.messages.slice(-MAX_MESSAGES) : [];
  const timestamp = value.createdAt || messages[0]?.timestamp || new Date().toISOString();
  return {
    id,
    title: safeStoredTitle(value.title),
    titleSource: value.titleSource === "user" ? "user" : "auto",
    messages,
    pendingAction: value.pendingAction || null,
    pendingClarification: value.pendingClarification || null,
    commandContext: value.commandContext || null,
    createdAt: timestamp,
    updatedAt: value.updatedAt || messages.at(-1)?.timestamp || timestamp
  };
}

function activeMemoryView(state) {
  const active = getActiveConversation(state);
  return {
    activeConversationId: active.id,
    activeConversationTitle: active.title,
    messages: active.messages,
    pendingAction: active.pendingAction,
    pendingClarification: active.pendingClarification,
    commandContext: active.commandContext,
    conversations: state.conversations.map(conversationSummary)
  };
}

function conversationSummary(conversation) {
  const lastMessage = conversation.messages.at(-1);
  return {
    id: conversation.id,
    title: conversation.title,
    messageCount: conversation.messages.length,
    preview: lastMessage ? compactText(lastMessage.content, 80) : "Sin mensajes",
    hasPendingAction: Boolean(conversation.pendingAction),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  };
}

function updateActiveConversation(updater) {
  const state = loadState();
  const conversation = getActiveConversation(state);
  updater(conversation);
  persistState(state);
  return conversation;
}

function persistState(state) {
  writeJson(DATA_FILES.memory, {
    version: 2,
    activeConversationId: state.activeConversationId,
    conversations: state.conversations
  });
}

function getActiveConversation(state) {
  return state.conversations.find((item) => item.id === state.activeConversationId) || state.conversations[0];
}

function findConversation(state, id) {
  const conversation = state.conversations.find((item) => item.id === String(id || ""));
  if (!conversation) throw new Error("No encontre esa conversacion local.");
  return conversation;
}

function validateTitle(title) {
  const value = compactText(title, MAX_TITLE_LENGTH);
  if (!value) throw new Error("El titulo de la conversacion no puede estar vacio.");
  const sensitivity = detectSensitiveText(value);
  if (sensitivity.sensitive) {
    const error = new Error("El titulo parece contener informacion sensible.");
    error.code = "SENSITIVE_TITLE";
    error.findings = sensitivity.findings;
    throw error;
  }
  return value;
}

function safeStoredTitle(title) {
  const value = compactText(title, MAX_TITLE_LENGTH);
  return value || "Conversacion local";
}

function titleFromMessage(content) {
  const value = compactText(content, 48);
  if (!value || detectSensitiveText(value).sensitive) return "Conversacion privada";
  return value;
}

function nextConversationTitle(conversations) {
  const base = "Nueva conversacion";
  const used = new Set(conversations.map((item) => item.title));
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function emptyConversation(title) {
  const timestamp = new Date().toISOString();
  return {
    id: createId("chat"),
    title,
    titleSource: "auto",
    messages: [],
    pendingAction: null,
    pendingClarification: null,
    commandContext: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function compactText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength).trim();
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSearch(value) {
  return [...new Set(String(value || "").split(" ").filter((token) => token.length > 1))];
}

function searchScore(content, query, queryTokens) {
  if (!content) return 0;
  if (content.includes(query)) return 1;
  const contentTokens = new Set(tokenizeSearch(content));
  const matched = queryTokens.filter((token) => contentTokens.has(token)).length;
  if (!matched) return 0;
  const coverage = matched / queryTokens.length;
  return coverage >= 0.5 ? Number((coverage * 0.8).toFixed(4)) : 0;
}

function searchSnippet(content, rawQuery) {
  const text = compactText(content, 2000);
  if (text.length <= 150) return text;
  const index = text.toLowerCase().indexOf(String(rawQuery || "").toLowerCase());
  const start = Math.max(0, index >= 0 ? index - 55 : 0);
  const snippet = text.slice(start, start + 150).trim();
  return `${start > 0 ? "..." : ""}${snippet}${start + 150 < text.length ? "..." : ""}`;
}

function countUserMessages(messages) {
  return messages.filter((message) => message.role === "user").length;
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

module.exports = {
  MAX_CONVERSATIONS,
  MAX_SEARCH_RESULTS,
  activateConversation,
  addMessage,
  clearCommandContext,
  clearMessages,
  clearPendingAction,
  clearPendingClarification,
  createConversation,
  deleteConversation,
  getCommandContext,
  getMemory,
  getPendingAction,
  getPendingClarification,
  listConversations,
  renameConversation,
  saveMemory,
  searchConversations,
  setCommandContext,
  setPendingAction,
  setPendingClarification
};
