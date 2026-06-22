const test = require("node:test");
const assert = require("node:assert/strict");

const { detectSensitiveText } = require("../src/sensitiveText");

test("detecta emails como texto sensible", () => {
  const result = detectSensitiveText("mi correo es persona@example.com");

  assert.equal(result.sensitive, true);
  assert.ok(result.findings.some((finding) => finding.type === "email"));
});

test("detecta contrasenas y tokens como texto sensible", () => {
  const password = detectSensitiveText("password: secreto123");
  const token = detectSensitiveText("token=ghp_abcdefghijklmnopqrstuvwxyz123456");

  assert.ok(password.findings.some((finding) => finding.type === "password"));
  assert.ok(token.findings.some((finding) => finding.type === "api_key"));
});

test("detecta rutas personales y numeros largos", () => {
  const pathResult = detectSensitiveText("abrir C:\\Users\\Matias\\Desktop\\archivo.txt");
  const numberResult = detectSensitiveText("mi numero es 12345678901");

  assert.ok(pathResult.findings.some((finding) => finding.type === "personal_path"));
  assert.ok(numberResult.findings.some((finding) => finding.type === "long_number"));
});

test("detecta posibles claves privadas", () => {
  const result = detectSensitiveText("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----");

  assert.equal(result.sensitive, true);
  assert.ok(result.findings.some((finding) => finding.type === "private_key"));
});

test("no marca frases normales de entrenamiento", () => {
  const result = detectSensitiveText("listar archivos de descargas");

  assert.equal(result.sensitive, false);
  assert.deepEqual(result.findings, []);
});
