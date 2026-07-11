const { spawn } = require("child_process");
const os = require("os");
const path = require("path");

const fileManager = require("./fileManager");

const ACTIONS = [
  {
    type: "help",
    label: "ayuda",
    description: "Muestra los comandos disponibles.",
    permission: null,
    requiresConfirmation: false
  },
  {
    type: "open_app",
    label: "abrir chrome / abrir bloc de notas / abrir explorador",
    description: "Abre una aplicacion permitida de Windows.",
    permission: "allowOpenApps",
    requiresConfirmation: false
  },
  {
    type: "create_desktop_folder",
    label: "crear carpeta llamada X en escritorio",
    description: "Crea una carpeta en el Escritorio.",
    permission: "allowFileWrite",
    requiresConfirmation: false
  },
  {
    type: "list_downloads",
    label: "listar archivos de descargas",
    description: "Lista los primeros archivos visibles de Descargas.",
    permission: "allowFileRead",
    requiresConfirmation: false
  },
  {
    type: "find_files",
    label: "buscar archivos [extension] que contengan X",
    description: "Busca nombres por texto, extension o categoria sin leer su contenido.",
    permission: "allowFileRead",
    requiresConfirmation: false
  },
  {
    type: "create_note",
    label: "crear nota llamada X con este texto: ...",
    description: "Crea un .txt en la carpeta SAW Local Notes del Escritorio.",
    permission: "allowFileWrite",
    requiresConfirmation: false
  },
  {
    type: "system_status",
    label: "mostrar estado del sistema",
    description: "Muestra datos basicos del sistema local.",
    permission: null,
    requiresConfirmation: false
  },
  {
    type: "organize_downloads",
    label: "organizar descargas por tipo",
    description: "Mueve archivos de Descargas a carpetas por tipo. Requiere confirmacion.",
    permission: "allowFileWrite",
    requiresConfirmation: true
  }
];

const ACTION_BY_TYPE = new Map(ACTIONS.map((item) => [item.type, item]));

function listActions() {
  return ACTIONS;
}

function getActionDefinition(type) {
  return ACTION_BY_TYPE.get(type) || null;
}

async function executeAction(action) {
  switch (action.type) {
    case "help":
      return helpResponse();
    case "open_app":
      return openApp(action.payload.app);
    case "create_desktop_folder":
      return createDesktopFolder(action.payload.name);
    case "list_downloads":
      return listDownloads();
    case "find_files":
      return findFiles(action.payload);
    case "create_note":
      return createNote(action.payload.name, action.payload.text);
    case "system_status":
      return systemStatus();
    case "organize_downloads":
      return organizeDownloads();
    default:
      throw new Error("Accion no implementada.");
  }
}

function helpResponse() {
  const lines = ACTIONS.map((item) => `- ${item.label}: ${item.description}`);
  return {
    message: `Comandos disponibles:\n${lines.join("\n")}`,
    summary: "Ayuda mostrada."
  };
}

async function openApp(app) {
  const labels = {
    chrome: "Chrome",
    notepad: "Bloc de notas",
    explorer: "Explorador de archivos"
  };

  const commandUsed = await openAllowedApp(app);
  return {
    message: `Listo. Intente abrir ${labels[app] || app}.`,
    summary: `Aplicacion abierta: ${labels[app] || app}`,
    details: { app, commandUsed }
  };
}

async function createDesktopFolder(name) {
  const result = await fileManager.createFolderOnDesktop(name);
  return {
    message: `Carpeta creada en el Escritorio: ${result.name}\n${result.path}`,
    summary: `Carpeta creada: ${result.name}`,
    details: { path: result.path, name: result.name }
  };
}

async function listDownloads() {
  const files = await fileManager.listDownloads();

  if (!files.length) {
    return {
      message: "La carpeta Descargas no tiene archivos visibles.",
      summary: "Descargas listada sin archivos visibles."
    };
  }

  const lines = files.map((file) => {
    const size = file.size === null ? "" : `, ${formatBytes(file.size)}`;
    return `- ${file.name} (${file.type}${size})`;
  });

  return {
    message: `Archivos visibles en Descargas:\n${lines.join("\n")}`,
    summary: `Descargas listada: ${files.length} entradas.`,
    details: { count: files.length }
  };
}

async function findFiles(payload) {
  const { term, extension = null, category = null, limit = 50 } = payload || {};
  const results = await fileManager.findFilesByName(term, { extension, category, limit });
  const filterLabel = extension ? ` .${String(extension).replace(/^\./, "")}` : category === "images" ? " de imagen" : category === "documents" ? " de documento" : "";

  if (!results.length) {
    return {
      message: `No encontre archivos${filterLabel} visibles que contengan "${term}".`,
      summary: "Busqueda sin resultados.",
      details: { term, extension, category, limit, count: 0 }
    };
  }

  const lines = results.map((item) => `- ${item.name} (${item.type})\n  Carpeta: ${item.directory}`);
  return {
    message: `Resultados${filterLabel} para "${term}":\n${lines.join("\n")}`,
    summary: `Busqueda completada: ${results.length} resultados.`,
    details: { term, extension, category, limit, count: results.length }
  };
}

async function createNote(name, text) {
  const result = await fileManager.createNote(name, text);
  return {
    message: `Nota creada: ${result.name}\n${result.path}`,
    summary: `Nota creada: ${result.name}`,
    details: { path: result.path, name: result.name, textLength: text.length }
  };
}

function systemStatus() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const uptimeHours = Math.round((os.uptime() / 60 / 60) * 10) / 10;
  const payload = {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    hostname: os.hostname(),
    cpuCount: os.cpus().length,
    totalMemory,
    freeMemory,
    uptimeHours
  };

  return {
    message: [
      "Estado del sistema:",
      `- Windows/Plataforma: ${payload.platform} ${payload.release} (${payload.arch})`,
      `- Equipo: ${payload.hostname}`,
      `- CPU: ${payload.cpuCount} nucleos logicos`,
      `- Memoria: ${formatBytes(freeMemory)} libres de ${formatBytes(totalMemory)}`,
      `- Encendido hace: ${uptimeHours} horas`
    ].join("\n"),
    summary: "Estado del sistema mostrado.",
    details: payload
  };
}

async function organizeDownloads() {
  const result = await fileManager.organizeDownloadsByType();
  const movedByCategory = result.moved.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});
  const categorySummary = Object.entries(movedByCategory)
    .map(([category, count]) => `- ${category}: ${count}`)
    .join("\n");

  return {
    message: [
      `Organizacion completada. Archivos movidos: ${result.moved.length}.`,
      categorySummary || "- No se movieron archivos.",
      `Omitidos: ${result.skipped.length}`
    ].join("\n"),
    summary: `Descargas organizada: ${result.moved.length} movidos, ${result.skipped.length} omitidos.`,
    details: {
      movedCount: result.moved.length,
      skippedCount: result.skipped.length,
      movedByCategory
    }
  };
}

async function openAllowedApp(app) {
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const candidates = {
    chrome: [
      path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      "chrome.exe"
    ],
    notepad: ["notepad.exe"],
    explorer: ["explorer.exe"]
  }[app];

  if (!candidates) {
    throw new Error("Aplicacion no permitida.");
  }

  let lastError = null;
  for (const command of candidates) {
    try {
      await spawnDetached(command);
      return command;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`No pude abrir la aplicacion: ${lastError?.message || "desconocido"}`);
}

function spawnDetached(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let current = value / 1024;
  let unit = units.shift();

  while (current >= 1024 && units.length) {
    current /= 1024;
    unit = units.shift();
  }

  return `${current.toFixed(current >= 10 ? 0 : 1)} ${unit}`;
}

module.exports = {
  executeAction,
  getActionDefinition,
  listActions
};
