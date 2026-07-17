const test = require("node:test");
const assert = require("node:assert/strict");

const { getSuggestions } = require("../src/suggestions");

test("propone comienzos utiles sin ejecutar ni confirmar acciones", () => {
  const suggestions = getSuggestions({ messages: [], pendingAction: null });
  assert.deepEqual(suggestions.map((item) => item.text), [
    "ayuda",
    "listar archivos de descargas",
    "mostrar estado del sistema"
  ]);
  assert.ok(suggestions.every((item) => item.execution === "user_message"));
});

test("ofrece opciones allowlisted para aclarar una aplicacion", () => {
  const suggestions = getSuggestions({
    messages: [],
    pendingAction: null,
    pendingClarification: { intent: "open_app", missing: ["app"] }
  });
  assert.deepEqual(suggestions.map((item) => item.text), ["Chrome", "Bloc de notas", "Explorador", "cancelar"]);
});

test("usa el contexto de busqueda sin incluir acciones riesgosas", () => {
  const suggestions = getSuggestions({
    messages: [{ role: "assistant", content: "Busqueda lista", meta: {} }],
    pendingAction: null,
    commandContext: {
      intent: "search_files",
      entities: { searchTerm: "factura" },
      storableCommand: "buscar archivos que contengan factura"
    }
  });
  const texts = suggestions.map((item) => item.text);
  assert.ok(texts.includes("solamente los PDF"));
  assert.ok(texts.includes("guardalo como favorito"));
  assert.equal(texts.some((text) => /confirmar|borrar|eliminar|shell|organizar/i.test(text)), false);
});

test("oculta sugerencias mientras existe una confirmacion pendiente", () => {
  const suggestions = getSuggestions({
    messages: [],
    pendingAction: { action: { type: "organize_downloads" } },
    pendingClarification: null
  });
  assert.deepEqual(suggestions, []);
});

test("propone siguientes pasos despues de mostrar la ayuda", () => {
  const suggestions = getSuggestions({
    messages: [{ role: "assistant", content: "Comandos disponibles", meta: { action: "action.help" } }],
    pendingAction: null,
    commandContext: null
  });
  assert.deepEqual(suggestions.map((item) => item.text), [
    "listar archivos de descargas",
    "mostrar estado del sistema"
  ]);
});
