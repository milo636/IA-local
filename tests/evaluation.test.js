const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const app = require("../server");
const { evaluate } = require("../src/evaluateLocalAI");

test("la evaluacion calcula metricas sin modificar el dataset", () => {
  const trainingPath = path.join(__dirname, "..", "data", "trainingData.json");
  const before = fs.readFileSync(trainingPath, "utf8");
  const resultsPath = path.join(os.tmpdir(), `atenea-evaluation-${Date.now()}.json`);

  try {
    const report = evaluate({ resultsPath });
    assert.ok(report.total >= 30);
    assert.ok(report.accuracy >= 0.9);
    assert.equal(report.correct + report.failures, report.total);
    assert.equal(fs.readFileSync(trainingPath, "utf8"), before);
  } finally {
    fs.rmSync(resultsPath, { force: true });
  }
});

test("POST /api/ai/evaluate devuelve el informe sin ejecutar acciones", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/ai/evaluate`, { method: "POST" });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.ok(payload.evaluation.total >= 30);
    assert.equal(payload.state.evaluation.evaluatedAt, payload.evaluation.evaluatedAt);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
