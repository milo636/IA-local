const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const DEFAULT_TRAINING_PATH = path.join(DATA_DIR, "trainingData.json");
const DEFAULT_BASE_TRAINING_PATH = path.join(DATA_DIR, "baseTrainingData.json");
const DEFAULT_MODEL_PATH = path.join(DATA_DIR, "localAIModel.json");
const DEFAULT_BACKUP_DIR = path.join(DATA_DIR, "backups");
const MODEL_VERSION = 1;
const DEFAULT_MIN_CONFIDENCE = 0.34;
const INTENT_LABELS = {
  help: "Ayuda",
  open_app: "Abrir aplicacion",
  create_folder: "Crear carpeta",
  list_downloads: "Listar descargas",
  search_files: "Buscar archivos",
  create_note: "Crear nota",
  system_status: "Estado del sistema",
  organize_downloads: "Organizar descargas",
  unknown: "Desconocida"
};

const VALID_INTENTS = new Set([
  "help",
  "open_app",
  "create_folder",
  "list_downloads",
  "search_files",
  "create_note",
  "system_status",
  "organize_downloads",
  "unknown"
]);

const STOPWORDS = new Set([
  "a",
  "al",
  "algo",
  "con",
  "de",
  "del",
  "el",
  "en",
  "este",
  "esto",
  "la",
  "las",
  "lo",
  "los",
  "me",
  "mi",
  "mis",
  "por",
  "que",
  "quiero",
  "quisiera",
  "un",
  "una",
  "y"
]);

let cachedModel = null;

function cleanText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const cleaned = cleanText(text);
  if (!cleaned) return [];

  return cleaned
    .split(" ")
    .filter((token) => token.length > 1)
    .filter((token) => !STOPWORDS.has(token));
}

function loadTrainingData(trainingPath = DEFAULT_TRAINING_PATH) {
  const parsed = JSON.parse(fs.readFileSync(trainingPath, "utf8"));
  validateTrainingData(parsed);
  return parsed;
}

function loadBaseTrainingData(baseTrainingPath = DEFAULT_BASE_TRAINING_PATH) {
  return loadTrainingData(baseTrainingPath);
}

function saveTrainingData(trainingData, trainingPath = DEFAULT_TRAINING_PATH) {
  validateTrainingData(trainingData);
  fs.mkdirSync(path.dirname(trainingPath), { recursive: true });
  const tmp = `${trainingPath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(trainingData, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, trainingPath);
  cachedModel = null;
}

function createTrainingBackup(options = {}) {
  const trainingPath = options.trainingPath || DEFAULT_TRAINING_PATH;
  const backupDir = options.backupDir || DEFAULT_BACKUP_DIR;

  if (!fs.existsSync(trainingPath)) {
    throw new Error("No existe trainingData.json para respaldar.");
  }

  fs.mkdirSync(backupDir, { recursive: true });
  const createdAt = new Date().toISOString();
  const safeStamp = createdAt.replace(/[:.]/g, "-");
  const backupName = `trainingData-${safeStamp}-${crypto.randomBytes(3).toString("hex")}.json`;
  const backupPath = path.join(backupDir, backupName);
  fs.copyFileSync(trainingPath, backupPath);

  return {
    createdAt,
    name: backupName,
    path: backupPath
  };
}

function validateTrainingData(trainingData) {
  if (!trainingData || typeof trainingData !== "object" || typeof trainingData.intents !== "object") {
    throw new Error("trainingData.json debe contener un objeto intents.");
  }

  for (const [intent, examples] of Object.entries(trainingData.intents)) {
    if (!VALID_INTENTS.has(intent)) {
      throw new Error(`Intencion no soportada: ${intent}`);
    }

    if (!Array.isArray(examples) || !examples.every((example) => typeof example === "string")) {
      throw new Error(`La intencion ${intent} debe tener ejemplos de texto.`);
    }
  }
}

function trainModel(trainingData) {
  validateTrainingData(trainingData);

  const examples = [];
  for (const [intent, phrases] of Object.entries(trainingData.intents)) {
    for (const phrase of phrases) {
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
    minConfidence: trainingData.minConfidence || DEFAULT_MIN_CONFIDENCE,
    intents: Object.keys(trainingData.intents),
    tokenWeights,
    profiles,
    examples: vectorizedExamples
  };
}

function trainFromFile(trainingPath = DEFAULT_TRAINING_PATH) {
  return trainModel(loadTrainingData(trainingPath));
}

function trainAndSave(options = {}) {
  const trainingPath = options.trainingPath || DEFAULT_TRAINING_PATH;
  const modelPath = options.modelPath || DEFAULT_MODEL_PATH;
  const model = trainFromFile(trainingPath);

  fs.mkdirSync(path.dirname(modelPath), { recursive: true });
  fs.writeFileSync(modelPath, `${JSON.stringify(model, null, 2)}\n`, "utf8");
  cachedModel = model;
  return model;
}

function loadModel(options = {}) {
  const modelPath = options.modelPath || DEFAULT_MODEL_PATH;
  const trainingPath = options.trainingPath || DEFAULT_TRAINING_PATH;

  if (cachedModel && !options.fresh) return cachedModel;

  if (fs.existsSync(modelPath)) {
    cachedModel = JSON.parse(fs.readFileSync(modelPath, "utf8"));
    return cachedModel;
  }

  cachedModel = trainFromFile(trainingPath);
  return cachedModel;
}

function classifyIntent(text, options = {}) {
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

function addTrainingExample(intent, text, options = {}) {
  if (!VALID_INTENTS.has(intent)) {
    throw new Error(`Intencion no soportada: ${intent}`);
  }

  const trimmedText = validateExampleText(text);

  const trainingPath = options.trainingPath || DEFAULT_TRAINING_PATH;
  const trainingData = loadTrainingData(trainingPath);
  if (!trainingData.intents[intent]) trainingData.intents[intent] = [];

  const normalizedNewText = cleanText(trimmedText);
  const exists = trainingData.intents[intent].some((example) => cleanText(example) === normalizedNewText);
  const backup = exists ? null : createTrainingBackup(options);
  if (!exists) {
    trainingData.intents[intent].push(trimmedText);
    saveTrainingData(trainingData, trainingPath);
  }

  return {
    added: !exists,
    backup,
    intent,
    example: trimmedText,
    trainingData
  };
}

function listIntents(options = {}) {
  let trainingData = null;
  try {
    trainingData = loadTrainingData(options.trainingPath || DEFAULT_TRAINING_PATH);
  } catch {
    trainingData = { intents: {} };
  }

  return Array.from(VALID_INTENTS).map((intent) => ({
    id: intent,
    label: INTENT_LABELS[intent] || intent,
    exampleCount: Array.isArray(trainingData.intents[intent]) ? trainingData.intents[intent].length : 0
  }));
}

function getModelStatus(options = {}) {
  const trainingPath = options.trainingPath || DEFAULT_TRAINING_PATH;
  const modelPath = options.modelPath || DEFAULT_MODEL_PATH;
  let trainingData = null;
  let model = null;
  let modelStats = null;

  try {
    trainingData = loadTrainingData(trainingPath);
  } catch {
    trainingData = { intents: {} };
  }

  try {
    modelStats = fs.existsSync(modelPath) ? fs.statSync(modelPath) : null;
    model = fs.existsSync(modelPath) ? loadModel({ modelPath, trainingPath, fresh: true }) : null;
  } catch {
    model = null;
  }

  const trainingExampleCount = countTrainingExamples(trainingData);
  const modelExampleCount = Array.isArray(model?.examples) ? model.examples.length : 0;

  return {
    status: model ? "trained" : "missing",
    available: Boolean(model),
    modelVersion: model?.modelVersion || MODEL_VERSION,
    intentCount: Object.keys(trainingData.intents || {}).length,
    exampleCount: modelExampleCount || trainingExampleCount,
    trainingExampleCount,
    minConfidence: model?.minConfidence || trainingData.minConfidence || DEFAULT_MIN_CONFIDENCE,
    lastTrainedAt: model?.trainedAt || modelStats?.mtime?.toISOString() || null
  };
}

function countTrainingExamples(trainingData) {
  return Object.values(trainingData.intents || {}).reduce((total, examples) => {
    return total + (Array.isArray(examples) ? examples.length : 0);
  }, 0);
}

function listTrainingExamples(options = {}) {
  const trainingData = loadTrainingData(options.trainingPath || DEFAULT_TRAINING_PATH);
  let baseTrainingData = null;

  try {
    baseTrainingData = loadBaseTrainingData(options.baseTrainingPath || DEFAULT_BASE_TRAINING_PATH);
  } catch {
    baseTrainingData = { intents: {} };
  }

  const baseKeys = new Set();
  for (const [intent, examples] of Object.entries(baseTrainingData.intents || {})) {
    for (const example of examples) {
      baseKeys.add(exampleKey(intent, example));
    }
  }

  return Object.entries(trainingData.intents || {}).flatMap(([intent, examples]) => {
    return examples.map((text, index) => ({
      id: createExampleId(intent, text),
      intent,
      label: INTENT_LABELS[intent] || intent,
      text,
      index,
      isBase: baseKeys.has(exampleKey(intent, text))
    }));
  });
}

function getTrainingDataset(options = {}) {
  const trainingData = loadTrainingData(options.trainingPath || DEFAULT_TRAINING_PATH);
  const examples = listTrainingExamples(options);

  return {
    version: trainingData.version || MODEL_VERSION,
    minConfidence: trainingData.minConfidence || DEFAULT_MIN_CONFIDENCE,
    examples,
    grouped: groupExamplesByIntent(examples),
    totalExamples: examples.length
  };
}

function updateTrainingExample(exampleId, updates = {}, options = {}) {
  const trainingPath = options.trainingPath || DEFAULT_TRAINING_PATH;
  const trainingData = loadTrainingData(trainingPath);
  const current = findTrainingExample(trainingData, exampleId);

  if (!current) {
    throw new Error("No encontre el ejemplo solicitado.");
  }

  const nextIntent = String(updates.intent || current.intent).trim();
  if (!VALID_INTENTS.has(nextIntent)) {
    throw new Error("La intencion seleccionada no esta permitida.");
  }

  const nextText = validateExampleText(updates.text);
  const duplicate = hasDuplicateExample(trainingData, nextIntent, nextText, {
    ignoreIntent: current.intent,
    ignoreIndex: current.index
  });

  if (duplicate) {
    throw new Error("Ese ejemplo ya existe para esa intencion.");
  }

  const backup = createTrainingBackup(options);
  trainingData.intents[current.intent].splice(current.index, 1);
  if (!trainingData.intents[nextIntent]) trainingData.intents[nextIntent] = [];

  if (current.intent === nextIntent) {
    trainingData.intents[nextIntent].splice(current.index, 0, nextText);
  } else {
    trainingData.intents[nextIntent].push(nextText);
  }

  saveTrainingData(trainingData, trainingPath);

  return {
    updated: true,
    backup,
    previous: current,
    example: {
      id: createExampleId(nextIntent, nextText),
      intent: nextIntent,
      text: nextText
    },
    trainingData
  };
}

function deleteTrainingExample(exampleId, options = {}) {
  const trainingPath = options.trainingPath || DEFAULT_TRAINING_PATH;
  const trainingData = loadTrainingData(trainingPath);
  const current = findTrainingExample(trainingData, exampleId);

  if (!current) {
    throw new Error("No encontre el ejemplo solicitado.");
  }

  const backup = createTrainingBackup(options);
  trainingData.intents[current.intent].splice(current.index, 1);
  saveTrainingData(trainingData, trainingPath);

  return {
    deleted: true,
    backup,
    example: current,
    trainingData
  };
}

function restoreBaseTrainingData(options = {}) {
  const trainingPath = options.trainingPath || DEFAULT_TRAINING_PATH;
  const baseTrainingPath = options.baseTrainingPath || DEFAULT_BASE_TRAINING_PATH;
  const baseTrainingData = loadBaseTrainingData(baseTrainingPath);
  const backup = createTrainingBackup(options);

  saveTrainingData(baseTrainingData, trainingPath);

  return {
    restored: true,
    backup,
    trainingData: baseTrainingData
  };
}

function resetModelCache() {
  cachedModel = null;
}

function groupExamplesByIntent(examples) {
  return examples.reduce((grouped, example) => {
    if (!grouped[example.intent]) grouped[example.intent] = [];
    grouped[example.intent].push(example);
    return grouped;
  }, {});
}

function findTrainingExample(trainingData, exampleId) {
  for (const [intent, examples] of Object.entries(trainingData.intents || {})) {
    for (let index = 0; index < examples.length; index += 1) {
      const text = examples[index];
      if (createExampleId(intent, text) === exampleId) {
        return {
          id: exampleId,
          intent,
          text,
          index
        };
      }
    }
  }

  return null;
}

function hasDuplicateExample(trainingData, intent, text, options = {}) {
  const normalizedNewText = cleanText(text);
  return (trainingData.intents[intent] || []).some((example, index) => {
    const isIgnored = options.ignoreIntent === intent && options.ignoreIndex === index;
    return !isIgnored && cleanText(example) === normalizedNewText;
  });
}

function validateExampleText(text) {
  const trimmedText = String(text || "").trim();
  if (!trimmedText) {
    throw new Error("El ejemplo no puede estar vacio.");
  }

  if (trimmedText.length > 500) {
    throw new Error("El ejemplo es demasiado largo para entrenamiento local.");
  }

  return trimmedText;
}

function createExampleId(intent, text) {
  return crypto
    .createHash("sha256")
    .update(`${intent}\0${cleanText(text)}`)
    .digest("hex")
    .slice(0, 16);
}

function exampleKey(intent, text) {
  return `${intent}\0${cleanText(text)}`;
}

function scoreIntent(intent, inputVector, model) {
  const profileScore = cosineSimilarity(inputVector, model.profiles[intent] || {});
  const matchingExamples = model.examples
    .filter((example) => example.intent === intent)
    .map((example) => cosineSimilarity(inputVector, example.vector))
    .sort((a, b) => b - a);

  const bestExampleScore = matchingExamples[0] || 0;
  const secondExampleScore = matchingExamples[1] || 0;
  return round(bestExampleScore * 0.68 + secondExampleScore * 0.12 + profileScore * 0.2);
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

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

module.exports = {
  VALID_INTENTS,
  addTrainingExample,
  classifyIntent,
  cleanText,
  createTrainingBackup,
  deleteTrainingExample,
  getTrainingDataset,
  getModelStatus,
  listTrainingExamples,
  listIntents,
  loadBaseTrainingData,
  loadModel,
  loadTrainingData,
  resetModelCache,
  restoreBaseTrainingData,
  saveTrainingData,
  tokenize,
  trainAndSave,
  trainFromFile,
  trainModel,
  updateTrainingExample
};
