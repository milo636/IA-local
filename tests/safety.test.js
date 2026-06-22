const test = require("node:test");
const assert = require("node:assert/strict");

const safety = require("../src/safety");

test("bloquea patrones de comandos peligrosos", () => {
  const result = safety.validateIncomingText("del C:\\Users\\Usuario\\Documents\\*.*");
  assert.equal(result.ok, false);
});

test("bloquea solicitudes sobre secretos", () => {
  const result = safety.validateIncomingText("buscar archivos que contengan api key");
  assert.equal(result.ok, false);
});

test("permite acciones incluidas en allowlist", () => {
  const result = safety.validateAction({
    type: "list_downloads",
    payload: {}
  });
  assert.equal(result.ok, true);
});

test("requiere confirmacion para organizar descargas", () => {
  const result = safety.requiresConfirmation(
    {
      type: "organize_downloads",
      payload: {},
      requiresConfirmation: true,
      risk: "high"
    },
    { safeMode: true }
  );
  assert.equal(result, true);
});
