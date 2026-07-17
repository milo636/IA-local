const MAX_SUGGESTIONS = 4;

function getSuggestions(memoryState = {}) {
  if (memoryState.pendingAction) return [];

  const clarification = clarificationSuggestions(memoryState.pendingClarification);
  if (clarification.length) return clarification;

  const context = contextSuggestions(memoryState.commandContext);
  if (context.length) return context.slice(0, MAX_SUGGESTIONS);

  const messages = Array.isArray(memoryState.messages) ? memoryState.messages : [];
  if (!messages.length) return starterSuggestions();

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  const action = lastAssistant?.meta?.action;
  if (action === "command.unknown" || action === "conversation.unknown") {
    return [
      suggestion("help", "Ver ayuda", "ayuda", "Muestra los comandos locales disponibles."),
      suggestion("status", "Estado del sistema", "mostrar estado del sistema", "Consulta informacion basica sin modificar archivos.")
    ];
  }

  if (action === "help" || action === "action.help") return starterSuggestions().slice(1);
  return [];
}

function clarificationSuggestions(pending) {
  if (!pending) return [];
  if (pending.intent === "open_app" && pending.missing?.includes("app")) {
    return [
      suggestion("clarify-chrome", "Chrome", "Chrome", "Completa la aplicacion solicitada."),
      suggestion("clarify-notepad", "Bloc de notas", "Bloc de notas", "Completa la aplicacion solicitada."),
      suggestion("clarify-explorer", "Explorador", "Explorador", "Completa la aplicacion solicitada."),
      suggestion("clarify-cancel", "Cancelar", "cancelar", "Cancela la solicitud pendiente sin ejecutar nada.")
    ];
  }
  return [suggestion("clarify-cancel", "Cancelar", "cancelar", "Cancela la solicitud pendiente sin ejecutar nada.")];
}

function contextSuggestions(context) {
  if (!context) return [];
  const suggestions = [];
  if (context.intent === "search_files" && context.entities?.searchTerm) {
    suggestions.push(
      suggestion("search-pdf", "Solo PDF", "solamente los PDF", "Refina la busqueda anterior usando su mismo texto."),
      suggestion("search-txt", "Solo TXT", "solamente los TXT", "Refina la busqueda anterior usando su mismo texto.")
    );
  }
  if (context.storableCommand || context.originalText) {
    suggestions.push(suggestion("save-favorite", "Guardar como favorito", "guardalo como favorito", "Guarda el ultimo comando permitido para reutilizarlo."));
  }
  return suggestions;
}

function starterSuggestions() {
  return [
    suggestion("help", "Ver ayuda", "ayuda", "Muestra los comandos locales disponibles."),
    suggestion("downloads", "Listar Descargas", "listar archivos de descargas", "Lee la lista de Descargas sin modificarla."),
    suggestion("status", "Estado del sistema", "mostrar estado del sistema", "Consulta informacion basica sin modificar archivos.")
  ];
}

function suggestion(id, label, text, reason) {
  return { id, label, text, reason, execution: "user_message" };
}

module.exports = {
  getSuggestions
};
