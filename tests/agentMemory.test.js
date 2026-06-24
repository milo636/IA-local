const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { handleMessage } = require("../src/agent");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILES_TO_BACKUP = [
  path.join(DATA_DIR, "userProfile.json"),
  path.join(DATA_DIR, "logs.json"),
  path.join(DATA_DIR, "memory.json")
];

test("recuerda datos por chat y responde desde el perfil", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    const remember = await handleMessage("recorda que uso Chrome");
    const answer = await handleMessage("cual es mi navegador favorito?");

    assert.equal(remember.detectedIntent, "memory.remember");
    assert.match(remember.reply, /Guarde|guardado|tenia/i);
    assert.equal(answer.detectedIntent, "memory.profile_question");
    assert.match(answer.reply, /Chrome/);

    const logs = readJson("logs.json");
    assert.ok(logs.some((log) => log.action === "memory.remember"));
    assert.equal(logs.some((log) => String(log.action).startsWith("action.")), false);
  });
});

test("muestra y busca recuerdos sin ejecutar acciones", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await handleMessage("recorda que mi carpeta principal es Descargas");
    const summary = await handleMessage("que recordas de mi");
    const search = await handleMessage("buscar recuerdos carpeta");

    assert.equal(summary.detectedIntent, "memory.summary");
    assert.match(summary.reply, /Descargas/);
    assert.equal(search.detectedIntent, "memory.search");
    assert.match(search.reply, /Descargas/);
  });
});

test("resuelve referencias de memoria corta", async () => {
  await withLocalDataBackup(async () => {
    resetRuntimeData();

    await handleMessage("mi carpeta anterior fue PruebaLocal");
    const result = await handleMessage("la carpeta anterior");

    assert.equal(result.detectedIntent, "memory.short_reference");
    assert.match(result.reply, /PruebaLocal/);
  });
});

async function withLocalDataBackup(callback) {
  const backups = new Map(
    FILES_TO_BACKUP.map((filePath) => [filePath, fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null])
  );

  try {
    await callback();
  } finally {
    for (const [filePath, contents] of backups.entries()) {
      if (contents === null) {
        if (fs.existsSync(filePath)) fs.rmSync(filePath);
      } else {
        fs.writeFileSync(filePath, contents, "utf8");
      }
    }
  }
}

function resetRuntimeData() {
  fs.writeFileSync(path.join(DATA_DIR, "logs.json"), "[]\n", "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "memory.json"), '{\n  "messages": [],\n  "pendingAction": null\n}\n', "utf8");
  fs.writeFileSync(path.join(DATA_DIR, "userProfile.json"), '{\n  "version": 1,\n  "preferredBrowser": null,\n  "preferredTheme": "Dark",\n  "favoriteFolders": [],\n  "customPreferences": {},\n  "memories": [],\n  "createdAt": null,\n  "updatedAt": null\n}\n', "utf8");
}

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), "utf8"));
}
