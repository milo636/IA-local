const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const agent = require("../src/agent");
const entityExtractor = require("../src/entityExtractor");
const localAI = require("../src/localAI");
const memory = require("../src/memory");
const safety = require("../src/safety");

const DATA_DIR = path.join(__dirname, "..", "data");
const RUNTIME_FILES = ["memory.json", "logs.json"].map((name) => path.join(DATA_DIR, name));

test("clasifica lenguaje rioplatense y errores tipograficos", () => {
  const cases = [
    ["abrime crhome", "open_app"],
    ["creame una carpeta proyecto", "create_folder"],
    ["listame descargas", "list_downloads"],
    ["buscame archivos factura", "search_files"],
    ["ordename las descargas", "organize_downloads"]
  ];

  for (const [text, expectedIntent] of cases) {
    const result = localAI.classifyIntent(text, { fresh: true });
    assert.equal(result.intent, expectedIntent, text);
    assert.ok(result.confidence >= 0.34, text);
  }
});

test("marca como ambigua una frase con dos acciones posibles", () => {
  const result = localAI.classifyIntent("crear nota o carpeta", { fresh: true });
  assert.equal(result.intent, "unknown");
  assert.equal(result.ambiguous, true);
  assert.equal(result.fallbackReason, "ambiguous");
  assert.ok(result.margin < 0.07);
});

test("extrae entidades de aplicaciones, carpetas, notas y busquedas", () => {
  assert.deepEqual(entityExtractor.extractEntities("abri chrome", "open_app").entities, { app: "chrome" });
  assert.equal(entityExtractor.extractEntities("crear carpeta llamada Proyecto", "create_folder").entities.folderName, "Proyecto");

  const note = entityExtractor.extractEntities("crear nota llamada compras que diga pan y leche", "create_note");
  assert.equal(note.entities.noteName, "compras");
  assert.equal(note.entities.noteText, "pan y leche");

  const search = entityExtractor.extractEntities("buscame PDF de factura limite 5", "search_files");
  assert.equal(search.entities.searchTerm, "factura");
  assert.equal(search.entities.extension, "pdf");
  assert.equal(search.entities.limit, 5);
});

test("una aclaracion se guarda sin ejecutar y vuelve a pasar por safety", async () => {
  await withRuntimeBackup(async () => {
    fs.writeFileSync(path.join(DATA_DIR, "memory.json"), JSON.stringify({ messages: [], pendingAction: null }, null, 2));
    fs.writeFileSync(path.join(DATA_DIR, "logs.json"), "[]\n");

    let safetyCalls = 0;
    const originalValidate = safety.validateIncomingText;
    safety.validateIncomingText = (...args) => {
      safetyCalls += 1;
      return originalValidate(...args);
    };

    try {
      const first = await agent.handleMessage("crear una nota");
      assert.match(first.reply, /nombre/i);
      assert.equal(memory.getPendingClarification().intent, "create_note");
      assert.equal(memory.getPendingAction(), null);

      const blocked = await agent.handleMessage("Remove-Item C:\\Usuarios -Recurse");
      assert.match(blocked.reply, /bloqueada por seguridad/i);
      assert.ok(safetyCalls >= 2);
      assert.equal(memory.getPendingClarification().intent, "create_note");
    } finally {
      safety.validateIncomingText = originalValidate;
    }
  });
});

test("los seguimientos reutilizan solo contexto permitido", () => {
  const context = {
    intent: "search_files",
    entities: { searchTerm: "factura" },
    originalText: "buscar archivos que contengan factura",
    executed: true
  };
  const followUp = entityExtractor.detectContextFollowUp("solamente los PDF", context);
  assert.equal(followUp.intent, "search_files");
  assert.equal(followUp.entities.searchTerm, "factura");
  assert.equal(followUp.entities.extension, "pdf");

  const correction = entityExtractor.detectContextFollowUp("mejor llamala Proyecto B", {
    intent: "create_folder",
    executed: true
  });
  assert.equal(correction.type, "already_executed_correction");
});

async function withRuntimeBackup(callback) {
  const backups = new Map(RUNTIME_FILES.map((file) => [file, fs.existsSync(file) ? fs.readFileSync(file) : null]));
  try {
    await callback();
  } finally {
    for (const [file, contents] of backups) {
      if (contents === null) fs.rmSync(file, { force: true });
      else fs.writeFileSync(file, contents);
    }
  }
}
