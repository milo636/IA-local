const test = require("node:test");
const assert = require("node:assert/strict");

const localAI = require("../src/localAI");

test("detecta abrir chrome como open_app", () => {
  const result = localAI.classifyIntent("abrí chrome");
  assert.equal(result.intent, "open_app");
  assert.ok(result.confidence >= 0.34);
});

test("detecta crear carpeta como create_folder", () => {
  const result = localAI.classifyIntent("crear carpeta llamada prueba");
  assert.equal(result.intent, "create_folder");
  assert.ok(result.confidence >= 0.34);
});

test("detecta listar descargas como list_downloads", () => {
  const result = localAI.classifyIntent("listar descargas");
  assert.equal(result.intent, "list_downloads");
  assert.ok(result.confidence >= 0.34);
});

test("devuelve unknown si no entiende", () => {
  const result = localAI.classifyIntent("quiero cocinar pasta con salsa");
  assert.equal(result.intent, "unknown");
});
