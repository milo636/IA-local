const localAI = require("./localAI");
const conversationAI = require("./conversationAI");

function main() {
  const [command, intent, ...textParts] = process.argv.slice(2);

  if (command === "add") {
    const text = textParts.join(" ").trim();
    if (!intent || !text) {
      throw new Error('Uso: npm run train -- add <intent> "texto de ejemplo"');
    }

    const result = localAI.addTrainingExample(intent, text);
    console.log(result.added ? `Ejemplo agregado a ${intent}.` : `El ejemplo ya existia en ${intent}.`);
  }

  const model = localAI.trainAndSave();
  const conversationModel = conversationAI.trainAndSave();
  console.log(`Modelo local entrenado: ${model.examples.length} ejemplos, ${model.intents.length} intenciones.`);
  console.log(`Modelo conversacional entrenado: ${conversationModel.examples.length} ejemplos, ${conversationModel.intents.length} intenciones.`);
}

try {
  main();
} catch (error) {
  console.error(`No se pudo entrenar la IA local: ${error.message}`);
  process.exit(1);
}
