const fs = require("fs");
const path = require("path");

const localAI = require("./localAI");
const { writeJsonFile } = require("./fileManager");

const DATA_PATH = path.join(__dirname, "..", "data", "evaluationData.json");
const RESULTS_PATH = path.join(__dirname, "..", "data", "evaluationResults.json");

function evaluate(options = {}) {
  const dataPath = options.dataPath || DATA_PATH;
  const resultsPath = options.resultsPath || RESULTS_PATH;
  const dataset = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const cases = Array.isArray(dataset.cases) ? dataset.cases : [];
  const model = options.model || localAI.trainModel(localAI.loadTrainingData());
  const confusionMatrix = {};
  const errors = [];
  let correct = 0;
  let ambiguous = 0;
  let unknown = 0;

  for (const item of cases) {
    const result = localAI.classifyIntent(item.text, { model });
    const predicted = result.intent;
    if (result.ambiguous) ambiguous += 1;
    if (predicted === "unknown") unknown += 1;

    confusionMatrix[item.expectedIntent] ||= {};
    confusionMatrix[item.expectedIntent][predicted] = (confusionMatrix[item.expectedIntent][predicted] || 0) + 1;

    const acceptedAmbiguity = item.allowAmbiguous === true && result.ambiguous;
    if (predicted === item.expectedIntent || acceptedAmbiguity) {
      correct += 1;
    } else {
      errors.push({
        text: item.text,
        expectedIntent: item.expectedIntent,
        detectedIntent: predicted,
        confidence: result.confidence,
        secondIntent: result.secondIntent,
        margin: result.margin,
        ambiguous: result.ambiguous,
        fallbackReason: result.fallbackReason
      });
    }
  }

  const report = {
    evaluatedAt: new Date().toISOString(),
    total: cases.length,
    correct,
    failures: errors.length,
    accuracy: cases.length ? round(correct / cases.length) : 0,
    ambiguous,
    unknown,
    errors,
    confusionMatrix
  };

  if (options.save !== false) writeJsonFile(resultsPath, report);
  return report;
}

function getLastEvaluation(options = {}) {
  const resultsPath = options.resultsPath || RESULTS_PATH;
  if (!fs.existsSync(resultsPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(resultsPath, "utf8"));
  } catch {
    return null;
  }
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

if (require.main === module) {
  const report = evaluate();
  console.log(`Evaluacion local: ${report.correct}/${report.total} correctas (${Math.round(report.accuracy * 100)}%).`);
  console.log(`Fallos: ${report.failures}. Ambiguas: ${report.ambiguous}. Unknown: ${report.unknown}.`);
  if (report.errors.length) {
    console.table(report.errors.map(({ text, expectedIntent, detectedIntent, confidence, margin }) => ({
      text,
      expectedIntent,
      detectedIntent,
      confidence,
      margin
    })));
  }
}

module.exports = {
  evaluate,
  getLastEvaluation
};
