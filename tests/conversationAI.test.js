const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const conversationAI = require("../src/conversationAI");

const DATA_DIR = path.join(__dirname, "..", "data");
const CONVERSATIONS_PATH = path.join(DATA_DIR, "conversations.json");
const MODEL_PATH = path.join(DATA_DIR, "conversationModel.json");

test("responde saludos con intencion conversacional", () => {
  const result = conversationAI.respondToConversation("hola", { random: () => 0 });

  assert.equal(result.intent, "greeting");
  assert.ok(result.confidence >= 0.34);
  assert.match(result.reply, /Hola|Buenas/);
  assert.equal(result.responseOrigin, "base");
});

test("responde despedidas", () => {
  const result = conversationAI.respondToConversation("chau", { random: () => 0 });

  assert.equal(result.intent, "farewell");
  assert.ok(result.confidence >= 0.34);
  assert.match(result.reply, /Hasta|Nos vemos|Chau/);
});

test("responde preguntas basicas de identidad y capacidades", () => {
  const identity = conversationAI.respondToConversation("quien sos", { random: () => 0 });
  const capabilities = conversationAI.respondToConversation("que podes hacer", { random: () => 0 });

  assert.equal(identity.intent, "identity");
  assert.match(identity.reply, /Atenea Local/);
  assert.equal(capabilities.intent, "capabilities");
  assert.match(capabilities.reply, /automatizaciones|abrir apps/i);
});

test("detecta ejemplos conversacionales ampliados", () => {
  const greeting = conversationAI.respondToConversation("que onda", { random: () => 0 });
  const farewell = conversationAI.respondToConversation("hablamos despues", { random: () => 0 });
  const thanks = conversationAI.respondToConversation("gracias Atenea", { random: () => 0 });

  assert.equal(greeting.intent, "greeting");
  assert.equal(farewell.intent, "farewell");
  assert.equal(thanks.intent, "thanks");
});

test("responde dudas de seguridad sin ejecutar acciones", () => {
  const privacy = conversationAI.respondToConversation("mis datos salen de mi pc", { random: () => 0 });
  const deleteFiles = conversationAI.respondToConversation("podes borrar archivos", { random: () => 0.5 });

  assert.equal(privacy.intent, "security");
  assert.match(privacy.reply, /No envio|local|localhost/i);
  assert.equal(deleteFiles.intent, "security");
  assert.match(deleteFiles.reply, /permisos|confirmacion|No borro/i);
});

test("responde feedback de error", () => {
  const result = conversationAI.respondToConversation("no entendiste", { random: () => 0 });

  assert.equal(result.intent, "error_feedback");
  assert.match(result.reply, /debug|corregir|contexto/i);
});

test("mantiene contexto corto de los ultimos mensajes", () => {
  const history = Array.from({ length: 10 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `mensaje ${index}`,
    timestamp: `2026-01-01T00:00:0${index % 10}.000Z`
  }));
  const result = conversationAI.respondToConversation("ok", { history, random: () => 0 });

  assert.equal(result.intent, "acknowledgement");
  assert.equal(result.context.length, 6);
  assert.equal(result.context[0].content, "mensaje 4");
  assert.equal(result.context[5].content, "mensaje 9");
});

test("aprende una respuesta conversacional local", () => {
  withConversationBackup(() => {
    const text = "como preferis que te llame";
    const response = "Podes llamarme Atenea.";
    const result = conversationAI.addConversationExample("identity", text, response);
    const model = conversationAI.trainAndSave();
    const answer = conversationAI.respondToConversation(text, { random: () => 0.99 });

    assert.equal(result.addedExample, true);
    assert.equal(result.addedResponse, true);
    assert.ok(model.examples.some((example) => example.text === text));
    assert.equal(answer.intent, "identity");
    assert.ok(["base", "learned"].includes(answer.responseOrigin));
  });
});

test("usa fallback cuando no entiende", () => {
  const result = conversationAI.respondToConversation("quiero cocinar pasta con salsa", { random: () => 0 });

  assert.equal(result.intent, "unknown");
  assert.equal(result.confidence, 0);
  assert.match(result.reply, /No estoy segura|Todavia no entiendo/);
});

function withConversationBackup(callback) {
  const originalConversations = fs.readFileSync(CONVERSATIONS_PATH, "utf8");
  const originalModel = fs.existsSync(MODEL_PATH) ? fs.readFileSync(MODEL_PATH, "utf8") : null;

  try {
    callback();
  } finally {
    fs.writeFileSync(CONVERSATIONS_PATH, originalConversations, "utf8");
    if (originalModel === null) {
      if (fs.existsSync(MODEL_PATH)) fs.rmSync(MODEL_PATH);
    } else {
      fs.writeFileSync(MODEL_PATH, originalModel, "utf8");
    }
    conversationAI.resetModelCache();
  }
}
