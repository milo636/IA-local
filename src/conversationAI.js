const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { cleanText, tokenize } = require("./localAI");
const { writeJsonFile } = require("./fileManager");

const DATA_DIR = path.join(__dirname, "..", "data");
const DEFAULT_CONVERSATIONS_PATH = path.join(DATA_DIR, "conversations.json");
const DEFAULT_MODEL_PATH = path.join(DATA_DIR, "conversationModel.json");
const MODEL_VERSION = 1;
const DEFAULT_MIN_CONFIDENCE = 0.34;
const DEFAULT_MAX_CONTEXT_MESSAGES = 6;

let cachedModel = null;

function loadConversationData(conversationsPath = DEFAULT_CONVERSATIONS_PATH) {
  const parsed = JSON.parse(fs.readFileSync(conversationsPath, "utf8"));
  validateConversationData(parsed);
  return parsed;
}

function saveConversationData(conversationData, conversationsPath = DEFAULT_CONVERSATIONS_PATH) {
  validateConversationData(conversationData);
  writeJsonFile(conversationsPath, conversationData);
  cachedModel = null;
}

function validateConversationData(data) {
  if (!data || typeof data !== "object" || typeof data.intents !== "object") {
    throw new Error("conversations.json debe contener un objeto intents.");
  }

  for (const [intent, definition] of Object.entries(data.intents)) {
    if (!definition || typeof definition !== "object") {
      throw new Error(`La intencion conversacional ${intent} no es valida.`);
    }

    if (!Array.isArray(definition.examples) || !definition.examples.every((example) => typeof example === "string")) {
      throw new Error(`La intencion conversacional ${intent} debe tener ejemplos de texto.`);
    }

    if (!Array.isArray(definition.responses) || !definition.responses.length) {
      throw new Error(`La intencion conversacional ${intent} debe tener respuestas.`);
    }

    for (const response of definition.responses) {
      if (typeof response === "string") continue;
      if (!response || typeof response.text !== "string") {
        throw new Error(`La intencion conversacional ${intent} contiene una respuesta invalida.`);
      }
    }
  }
}

function trainModel(conversationData) {
  validateConversationData(conversationData);

  const examples = [];
  for (const [intent, definition] of Object.entries(conversationData.intents)) {
    for (const phrase of definition.examples) {
      const tokens = tokenize(phrase);
      if (!tokens.length) continue;
      examples.push({ intent, text: phrase, tokens });
    }
  }

  const documentFrequency = {};
  for (const example of examples) {
    for (const token of new Set(example.tokens)) {
      documentFrequency[token] = (documentFrequency[token] || 0) + 1;
    }
  }

  const tokenWeights = {};
  for (const [token, frequency] of Object.entries(documentFrequency)) {
    tokenWeights[token] = round(Math.log((1 + examples.length) / (1 + frequency)) + 1);
  }

  const vectorizedExamples = examples.map((example) => ({
    intent: example.intent,
    text: example.text,
    tokens: example.tokens,
    vector: vectorize(example.tokens, tokenWeights)
  }));

  const profiles = {};
  for (const example of vectorizedExamples) {
    if (!profiles[example.intent]) profiles[example.intent] = {};
    addVector(profiles[example.intent], example.vector);
  }

  for (const intent of Object.keys(profiles)) {
    normalizeVector(profiles[intent]);
  }

  return {
    modelVersion: MODEL_VERSION,
    trainedAt: new Date().toISOString(),
    minConfidence: conversationData.minConfidence || DEFAULT_MIN_CONFIDENCE,
    maxContextMessages: conversationData.maxContextMessages || DEFAULT_MAX_CONTEXT_MESSAGES,
    intents: Object.keys(conversationData.intents),
    tokenWeights,
    profiles,
    examples: vectorizedExamples,
    responseCount: countResponses(conversationData),
    learnedResponseCount: countLearnedResponses(conversationData)
  };
}

function trainFromFile(conversationsPath = DEFAULT_CONVERSATIONS_PATH) {
  return trainModel(loadConversationData(conversationsPath));
}

function trainAndSave(options = {}) {
  const conversationsPath = options.conversationsPath || DEFAULT_CONVERSATIONS_PATH;
  const modelPath = options.modelPath || DEFAULT_MODEL_PATH;
  const model = trainFromFile(conversationsPath);

  fs.mkdirSync(path.dirname(modelPath), { recursive: true });
  fs.writeFileSync(modelPath, `${JSON.stringify(model, null, 2)}\n`, "utf8");
  cachedModel = model;
  return model;
}

function loadModel(options = {}) {
  const modelPath = options.modelPath || DEFAULT_MODEL_PATH;
  const conversationsPath = options.conversationsPath || DEFAULT_CONVERSATIONS_PATH;

  if (cachedModel && !options.fresh) return cachedModel;

  if (fs.existsSync(modelPath)) {
    cachedModel = JSON.parse(fs.readFileSync(modelPath, "utf8"));
    return cachedModel;
  }

  cachedModel = trainAndSave({ conversationsPath, modelPath });
  return cachedModel;
}

function classifyConversation(text, options = {}) {
  const model = options.model || loadModel(options);
  const tokens = tokenize(text);

  if (!tokens.length) {
    return result("unknown", 0, tokens, []);
  }

  const inputVector = vectorize(tokens, model.tokenWeights);
  const scores = model.intents
    .map((intent) => ({
      intent,
      score: scoreIntent(intent, inputVector, model)
    }))
    .sort((a, b) => b.score - a.score);

  const best = scores[0] || { intent: "unknown", score: 0 };
  const confidence = round(Math.max(0, Math.min(1, best.score)));

  if (best.intent === "unknown" || confidence < (options.minConfidence || model.minConfidence || DEFAULT_MIN_CONFIDENCE)) {
    return result("unknown", confidence, tokens, scores);
  }

  return result(best.intent, confidence, tokens, scores);
}

function respondToConversation(text, options = {}) {
  const conversationData = loadConversationData(options.conversationsPath || DEFAULT_CONVERSATIONS_PATH);
  const model = options.model || loadModel(options);
  const classification = classifyConversation(text, { ...options, model });
  const intent = classification.intent === "unknown" ? "unknown" : classification.intent;
  const definition = conversationData.intents[intent] || conversationData.intents.unknown;
  const responses = normalizeResponses(definition.responses);
  const selected = selectResponse(responses, options.random);
  const context = buildShortContext(options.history || [], model.maxContextMessages || DEFAULT_MAX_CONTEXT_MESSAGES);

  return {
    intent,
    confidence: classification.intent === "unknown" ? 0 : classification.confidence,
    reply: selected.text,
    responseOrigin: selected.source || "base",
    responseId: selected.id || createResponseId(intent, selected.text),
    context,
    scores: classification.scores
  };
}

function addConversationExample(intent, text, responseText, options = {}) {
  const conversationData = loadConversationData(options.conversationsPath || DEFAULT_CONVERSATIONS_PATH);

  if (!Object.hasOwn(conversationData.intents, intent) || intent === "unknown") {
    throw new Error("La intencion conversacional seleccionada no esta permitida.");
  }

  const example = validateLearningText(text, "El ejemplo");
  const response = validateLearningText(responseText, "La respuesta");
  const definition = conversationData.intents[intent];
  const normalizedExample = cleanText(example);
  const normalizedResponse = cleanText(response);
  const exampleExists = definition.examples.some((item) => cleanText(item) === normalizedExample);
  const responseExists = normalizeResponses(definition.responses).some((item) => cleanText(item.text) === normalizedResponse);

  if (!exampleExists) definition.examples.push(example);
  if (!responseExists) {
    definition.responses.push({
      id: createResponseId(intent, response),
      text: response,
      source: "learned",
      learnedAt: new Date().toISOString()
    });
  }

  saveConversationData(conversationData, options.conversationsPath || DEFAULT_CONVERSATIONS_PATH);

  return {
    addedExample: !exampleExists,
    addedResponse: !responseExists,
    intent,
    example,
    response,
    conversationData
  };
}

function listConversationIntents(options = {}) {
  const conversationData = loadConversationData(options.conversationsPath || DEFAULT_CONVERSATIONS_PATH);
  return Object.entries(conversationData.intents).map(([intent, definition]) => ({
    id: intent,
    label: definition.label || intent,
    exampleCount: definition.examples.length,
    responseCount: definition.responses.length,
    learnedResponseCount: normalizeResponses(definition.responses).filter((response) => response.source === "learned").length
  }));
}

function getModelStatus(options = {}) {
  const conversationsPath = options.conversationsPath || DEFAULT_CONVERSATIONS_PATH;
  const modelPath = options.modelPath || DEFAULT_MODEL_PATH;
  let conversationData = null;
  let model = null;
  let modelStats = null;

  try {
    conversationData = loadConversationData(conversationsPath);
  } catch {
    conversationData = { intents: {} };
  }

  try {
    modelStats = fs.existsSync(modelPath) ? fs.statSync(modelPath) : null;
    model = fs.existsSync(modelPath) ? loadModel({ modelPath, conversationsPath, fresh: true }) : null;
  } catch {
    model = null;
  }

  return {
    status: model ? "trained" : "missing",
    available: Boolean(model),
    modelVersion: model?.modelVersion || MODEL_VERSION,
    intentCount: Object.keys(conversationData.intents || {}).length,
    exampleCount: countExamples(conversationData),
    responseCount: countResponses(conversationData),
    learnedResponseCount: countLearnedResponses(conversationData),
    minConfidence: model?.minConfidence || conversationData.minConfidence || DEFAULT_MIN_CONFIDENCE,
    lastTrainedAt: model?.trainedAt || modelStats?.mtime?.toISOString() || null
  };
}

function resetModelCache() {
  cachedModel = null;
}

function buildShortContext(history, limit = DEFAULT_MAX_CONTEXT_MESSAGES) {
  return (Array.isArray(history) ? history : [])
    .slice(-limit)
    .map((message) => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || null
    }));
}

function normalizeResponses(responses) {
  return responses.map((response) => {
    if (typeof response === "string") {
      return {
        id: createResponseId("legacy", response),
        text: response,
        source: "base"
      };
    }

    return {
      id: response.id || createResponseId("response", response.text),
      text: response.text,
      source: response.source || "base",
      learnedAt: response.learnedAt || null
    };
  });
}

function selectResponse(responses, random = Math.random) {
  if (!responses.length) {
    return {
      id: "fallback",
      text: "Todavia no tengo una respuesta para eso.",
      source: "base"
    };
  }

  const index = Math.max(0, Math.min(responses.length - 1, Math.floor(random() * responses.length)));
  return responses[index];
}

function countExamples(conversationData) {
  return Object.values(conversationData.intents || {}).reduce((total, definition) => total + definition.examples.length, 0);
}

function countResponses(conversationData) {
  return Object.values(conversationData.intents || {}).reduce((total, definition) => total + definition.responses.length, 0);
}

function countLearnedResponses(conversationData) {
  return Object.values(conversationData.intents || {}).reduce((total, definition) => {
    return total + normalizeResponses(definition.responses).filter((response) => response.source === "learned").length;
  }, 0);
}

function validateLearningText(text, label) {
  const value = String(text || "").trim();
  if (!value) {
    throw new Error(`${label} no puede estar vacio.`);
  }

  if (value.length > 500) {
    throw new Error(`${label} es demasiado largo.`);
  }

  return value;
}

function scoreIntent(intent, inputVector, model) {
  const profileScore = cosineSimilarity(inputVector, model.profiles[intent] || {});
  const matchingExamples = model.examples
    .filter((example) => example.intent === intent)
    .map((example) => cosineSimilarity(inputVector, example.vector))
    .sort((a, b) => b - a);

  const bestExampleScore = matchingExamples[0] || 0;
  const secondExampleScore = matchingExamples[1] || 0;
  return round(bestExampleScore * 0.72 + secondExampleScore * 0.1 + profileScore * 0.18);
}

function vectorize(tokens, tokenWeights) {
  const vector = {};
  for (const token of tokens) {
    const weight = tokenWeights[token] || 1;
    vector[token] = (vector[token] || 0) + weight;
  }
  normalizeVector(vector);
  return vector;
}

function addVector(target, source) {
  for (const [token, value] of Object.entries(source)) {
    target[token] = (target[token] || 0) + value;
  }
}

function normalizeVector(vector) {
  const norm = Math.sqrt(Object.values(vector).reduce((sum, value) => sum + value * value, 0));
  if (!norm) return vector;

  for (const token of Object.keys(vector)) {
    vector[token] = round(vector[token] / norm);
  }

  return vector;
}

function cosineSimilarity(a, b) {
  let score = 0;
  const [small, large] = Object.keys(a).length <= Object.keys(b).length ? [a, b] : [b, a];

  for (const [token, value] of Object.entries(small)) {
    if (large[token]) score += value * large[token];
  }

  return round(score);
}

function result(intent, confidence, tokens, scores) {
  return {
    intent,
    confidence: round(confidence),
    tokens,
    scores: scores.slice(0, 5).map((item) => ({
      intent: item.intent,
      score: round(item.score)
    }))
  };
}

function createResponseId(intent, text) {
  return crypto
    .createHash("sha256")
    .update(`${intent}\0${cleanText(text)}`)
    .digest("hex")
    .slice(0, 16);
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

module.exports = {
  addConversationExample,
  classifyConversation,
  getModelStatus,
  listConversationIntents,
  loadConversationData,
  loadModel,
  resetModelCache,
  respondToConversation,
  saveConversationData,
  trainAndSave,
  trainFromFile,
  trainModel
};
