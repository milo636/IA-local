const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const fileManager = require("../src/fileManager");
const { parseCommand } = require("../src/commandParser");

test("parsea busquedas por extension y categoria", () => {
  assert.deepEqual(parseCommand("buscar archivos pdf que contengan factura").payload, {
    term: "factura",
    extension: "pdf"
  });
  assert.deepEqual(parseCommand("buscar imagenes que contengan logo limite 10").payload, {
    term: "logo",
    category: "images",
    limit: 10
  });
});

test("busca por extension, limita resultados y muestra la carpeta", async () => {
  const root = fs.mkdtempSync(path.join(__dirname, ".tmp-search-"));
  try {
    fs.writeFileSync(path.join(root, "factura-enero.pdf"), "dato de prueba", "utf8");
    fs.writeFileSync(path.join(root, "factura-enero.txt"), "dato de prueba", "utf8");
    fs.writeFileSync(path.join(root, "factura-febrero.pdf"), "dato de prueba", "utf8");

    const results = await fileManager.findFilesByName("factura", {
      extension: "pdf",
      limit: 1,
      roots: [root]
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].extension, ".pdf");
    assert.equal(results[0].directory, root);
    assert.equal(Object.hasOwn(results[0], "content"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
