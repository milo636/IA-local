const test = require("node:test");
const assert = require("node:assert/strict");

const { parseCommand } = require("../src/commandParser");
const { parseActionFromIntent } = require("../src/commandParser");

test("parsea comandos de apertura permitidos", () => {
  assert.deepEqual(parseCommand("abrir chrome").payload, { app: "chrome" });
  assert.equal(parseCommand("abrir bloc de notas").type, "open_app");
  assert.equal(parseCommand("abrir explorador").type, "open_app");
});

test("parsea creacion de carpetas y notas", () => {
  const folder = parseCommand("crear carpeta llamada Pruebas en escritorio");
  assert.equal(folder.type, "create_desktop_folder");
  assert.equal(folder.payload.name, "Pruebas");

  const note = parseCommand("crear nota llamada ideas con este texto: hola mundo");
  assert.equal(note.type, "create_note");
  assert.equal(note.payload.name, "ideas");
  assert.equal(note.payload.text, "hola mundo");
});

test("marca organizar descargas como riesgoso y con confirmacion", () => {
  const parsed = parseCommand("organizar descargas por tipo");
  assert.equal(parsed.type, "organize_downloads");
  assert.equal(parsed.requiresConfirmation, true);
  assert.equal(parsed.risk, "high");
});

test("mapea intencion open_app a accion allowlisted", () => {
  const parsed = parseActionFromIntent("open_app", "abrí chrome");
  assert.equal(parsed.type, "open_app");
  assert.deepEqual(parsed.payload, { app: "chrome" });
});

test("mapea intencion create_folder a accion existente", () => {
  const parsed = parseActionFromIntent("create_folder", "crear carpeta llamada prueba");
  assert.equal(parsed.type, "create_desktop_folder");
  assert.deepEqual(parsed.payload, { name: "prueba" });
});
