const { DATA_FILES, DEFAULT_SETTINGS, readJson, writeJson } = require("./fileManager");

const PERMISSION_LABELS = {
  safeMode: "Modo seguro",
  allowOpenApps: "Abrir aplicaciones",
  allowFileRead: "Leer archivos locales",
  allowFileWrite: "Crear o mover archivos",
  allowDelete: "Borrar archivos",
  allowShellCommands: "Ejecutar comandos shell",
  allowNetwork: "Usar red"
};

function getSettings() {
  return {
    ...DEFAULT_SETTINGS,
    ...readJson(DATA_FILES.settings, DEFAULT_SETTINGS)
  };
}

function updateSettings(patch) {
  const current = getSettings();
  const next = { ...current };

  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) {
      throw new Error(`Permiso desconocido: ${key}`);
    }

    if (typeof value !== "boolean") {
      throw new Error(`El permiso ${key} debe ser verdadero o falso.`);
    }

    next[key] = value;
  }

  writeJson(DATA_FILES.settings, next);
  return next;
}

function isAllowed(permissionName) {
  return Boolean(getSettings()[permissionName]);
}

function permissionLabel(permissionName) {
  return PERMISSION_LABELS[permissionName] || permissionName;
}

function describePermissions() {
  const settings = getSettings();
  return Object.entries(PERMISSION_LABELS).map(([key, label]) => ({
    key,
    label,
    enabled: Boolean(settings[key])
  }));
}

module.exports = {
  describePermissions,
  getSettings,
  isAllowed,
  permissionLabel,
  updateSettings
};
