const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const favorites = require("../src/favorites");
const routines = require("../src/routines");
const { parseProductivityRequest } = require("../src/agent");

const DATA_DIR = path.join(__dirname, "..", "data");
const FAVORITES_PATH = path.join(DATA_DIR, "favorites.json");
const ROUTINES_PATH = path.join(DATA_DIR, "routines.json");

test("crea, lista y borra favoritos sin ejecutar acciones", () => {
  withProductivityBackup(() => {
    resetProductivityData();
    const favorite = favorites.createFavorite({ name: "estado", command: "mostrar estado del sistema" });

    assert.equal(favorite.actionType, "system_status");
    assert.equal(favorites.listFavorites().length, 1);
    assert.equal(favorites.findFavorite("estado").id, favorite.id);
    assert.equal(favorites.deleteFavorite(favorite.id).id, favorite.id);
    assert.equal(favorites.listFavorites().length, 0);
  });
});

test("rechaza favoritos con comandos fuera de la allowlist", () => {
  withProductivityBackup(() => {
    resetProductivityData();
    assert.throws(
      () => favorites.createFavorite({ name: "peligroso", command: "del C:\\temp\\archivo.txt" }),
      /peligroso|allowlist|bloquee/i
    );
  });
});

test("rechaza informacion sensible en comandos guardados", () => {
  withProductivityBackup(() => {
    resetProductivityData();
    assert.throws(
      () => favorites.createFavorite({ name: "nota", command: "crear nota llamada contacto con este texto: persona@example.com" }),
      /sensible/i
    );
    assert.equal(favorites.listFavorites().length, 0);
  });
});

test("crea y borra rutinas formadas solo por acciones permitidas", () => {
  withProductivityBackup(() => {
    resetProductivityData();
    const routine = routines.createRoutine({
      name: "revision",
      commands: ["mostrar estado del sistema", "ayuda"]
    });

    assert.equal(routine.steps.length, 2);
    assert.deepEqual(routine.steps.map((step) => step.actionType), ["system_status", "help"]);
    assert.equal(routines.findRoutine("revision").id, routine.id);
    routines.deleteRoutine(routine.id);
    assert.equal(routines.listRoutines().length, 0);
  });
});

test("interpreta comandos de productividad sin ejecutar nada", () => {
  assert.deepEqual(parseProductivityRequest("guardar como favorito abrir chrome"), {
    type: "favorite.create",
    command: "abrir chrome"
  });
  assert.deepEqual(parseProductivityRequest("crear rutina llamada inicio con abrir chrome y abrir explorador"), {
    type: "routine.create",
    name: "inicio",
    commands: ["abrir chrome", "abrir explorador"]
  });
});

function withProductivityBackup(callback) {
  const favoritesContents = fs.readFileSync(FAVORITES_PATH, "utf8");
  const routinesContents = fs.readFileSync(ROUTINES_PATH, "utf8");
  try {
    callback();
  } finally {
    fs.writeFileSync(FAVORITES_PATH, favoritesContents, "utf8");
    fs.writeFileSync(ROUTINES_PATH, routinesContents, "utf8");
  }
}

function resetProductivityData() {
  fs.writeFileSync(FAVORITES_PATH, '{\n  "version": 1,\n  "items": [],\n  "updatedAt": null\n}\n', "utf8");
  fs.writeFileSync(ROUTINES_PATH, '{\n  "version": 1,\n  "items": [],\n  "updatedAt": null\n}\n', "utf8");
}
