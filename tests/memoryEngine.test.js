const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const memoryEngine = require("../src/memoryEngine");

test("guarda recuerdos y actualiza perfil local", () => {
  withTempProfile((profilePath) => {
    const result = memoryEngine.saveMemory("Uso Chrome como navegador principal", { profilePath });
    const profile = memoryEngine.loadProfile({ profilePath });

    assert.equal(result.added, true);
    assert.equal(profile.memories.length, 1);
    assert.equal(profile.preferredBrowser, "Chrome");
    assert.equal(typeof profile.updatedAt, "string");
  });
});

test("busca recuerdos por similitud simple", () => {
  withTempProfile((profilePath) => {
    memoryEngine.saveMemory("Uso Chrome como navegador principal", { profilePath });
    const results = memoryEngine.searchMemory("que navegador uso", { profilePath });

    assert.ok(results.length >= 1);
    assert.match(results[0].text, /Chrome|Navegador/i);
  });
});

test("borra recuerdos por id o texto", () => {
  withTempProfile((profilePath) => {
    const saved = memoryEngine.saveMemory("Prefiero trabajar con Descargas", { profilePath });
    const deleted = memoryEngine.deleteMemory(saved.memory.id, { profilePath });
    const profile = memoryEngine.loadProfile({ profilePath });

    assert.equal(deleted.deleted.length, 1);
    assert.equal(profile.memories.length, 0);
  });
});

test("mantiene perfil persistente entre lecturas", () => {
  withTempProfile((profilePath) => {
    memoryEngine.saveMemory("Mi carpeta principal es Descargas", { profilePath });
    const first = memoryEngine.loadProfile({ profilePath });
    const second = memoryEngine.loadProfile({ profilePath });

    assert.deepEqual(second.favoriteFolders, first.favoriteFolders);
    assert.ok(second.favoriteFolders.includes("Descargas"));
  });
});

test("rechaza recuerdos con datos sensibles", () => {
  withTempProfile((profilePath) => {
    assert.throws(
      () => memoryEngine.saveMemory("Mi CBU es 1234567890123456789012", { profilePath }),
      /datos sensibles|sensibles/i
    );

    const profile = memoryEngine.loadProfile({ profilePath });
    assert.equal(profile.memories.length, 0);
  });
});

test("interpreta comandos de memoria", () => {
  const remember = memoryEngine.parseMemoryRequest("recorda que uso Chrome");
  const forget = memoryEngine.parseMemoryRequest("olvida Chrome");
  const summary = memoryEngine.parseMemoryRequest("que recordas de mi");

  assert.equal(remember.type, "remember");
  assert.equal(remember.text, "uso Chrome");
  assert.equal(forget.type, "forget");
  assert.equal(summary.type, "summary");
});

function withTempProfile(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atenea-memory-"));
  const profilePath = path.join(dir, "userProfile.json");

  try {
    callback(profilePath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
