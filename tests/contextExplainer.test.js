const test = require("node:test");
const assert = require("node:assert/strict");

const contextExplainer = require("../src/contextExplainer");
const conversationAI = require("../src/conversationAI");

const SETTINGS = {
  safeMode: true,
  allowOpenApps: true,
  allowFileRead: true,
  allowFileWrite: true
};

test("detecta preguntas de seguimiento sobre seguridad, permisos y contexto", () => {
  assert.equal(contextExplainer.detectContextQuestion("eso es seguro?"), "safety");
  assert.equal(contextExplainer.detectContextQuestion("que permiso usa esa accion"), "permission");
  assert.equal(contextExplainer.detectContextQuestion("por que necesita confirmacion"), "why");
  assert.equal(contextExplainer.detectContextQuestion("mostrame el contexto activo"), "context");
  assert.equal(contextExplainer.detectContextQuestion("hola atenea"), null);
});

test("el snapshot pendiente no expone texto ni entidades privadas", () => {
  const snapshot = contextExplainer.getContextSnapshot({
    pendingAction: {
      createdAt: "2026-07-18T10:00:00.000Z",
      action: {
        type: "create_note",
        original: "crear nota con token ghp_123456789012345678901234",
        payload: {
          name: "privado",
          text: "contrasena secreta"
        }
      }
    }
  }, SETTINGS);

  assert.equal(snapshot.status, "pending_confirmation");
  assert.equal(snapshot.actionType, "create_note");
  assert.equal(snapshot.executed, false);
  assert.equal(snapshot.permissionKey, "allowFileWrite");
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /ghp_|contrasena|privado|secreta/i);
});

test("explica permisos sin ejecutar ni reconstruir el comando original", () => {
  const result = contextExplainer.explainContext("que permiso usa", {
    commandContext: {
      intent: "search_files",
      actionType: "find_files",
      entities: { searchTerm: "documento privado" },
      originalText: "buscar documento privado",
      executed: true,
      updatedAt: "2026-07-18T10:00:00.000Z"
    }
  }, SETTINGS);

  assert.equal(result.intent, "context.permission");
  assert.equal(result.snapshot.permissionKey, "allowFileRead");
  assert.match(result.reply, /Leer archivos locales/);
  assert.doesNotMatch(result.reply, /documento privado/i);
});

test("deja la seguridad general al motor conversacional cuando no hay contexto", () => {
  const result = contextExplainer.explainContext("es seguro", {}, SETTINGS);
  assert.equal(result, null);
});

test("informa el permiso real aunque todavia falte una aclaracion", () => {
  const result = contextExplainer.explainContext("que permiso necesita", {
    pendingClarification: {
      intent: "create_note",
      missing: ["noteName", "noteText"],
      createdAt: "2026-07-18T10:00:00.000Z"
    }
  }, SETTINGS);
  assert.equal(result.snapshot.status, "pending_clarification");
  assert.equal(result.snapshot.permissionKey, "allowFileWrite");
  assert.match(result.reply, /Crear o mover archivos/);
  assert.match(result.snapshot.summary, /nombre de la nota/);
});

test("el dataset conversacional reconoce seguimientos de contexto", () => {
  const result = conversationAI.classifyConversation("mostrame el contexto activo");
  assert.equal(result.intent, "context_follow_up");
  assert.ok(result.confidence >= 0.45);
});
