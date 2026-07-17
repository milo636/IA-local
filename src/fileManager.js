const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");

const ROOT_DIR = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");

const DEFAULT_SETTINGS = {
  safeMode: true,
  allowOpenApps: true,
  allowFileRead: true,
  allowFileWrite: true,
  allowDelete: false,
  allowShellCommands: false,
  allowNetwork: false,
  allowScheduledActions: false
};

const DEFAULT_MEMORY = {
  version: 2,
  activeConversationId: null,
  conversations: [],
  messages: [],
  pendingAction: null,
  pendingClarification: null,
  commandContext: null
};

const DEFAULT_USER_PROFILE = {
  version: 1,
  preferredBrowser: null,
  preferredTheme: "Dark",
  favoriteFolders: [],
  customPreferences: {},
  memories: [],
  createdAt: null,
  updatedAt: null
};

const DEFAULT_LOGS = [];

const DEFAULT_FAVORITES = {
  version: 1,
  items: [],
  updatedAt: null
};

const DEFAULT_ROUTINES = {
  version: 1,
  items: [],
  updatedAt: null
};

const DEFAULT_SCHEDULED_TASKS = {
  version: 1,
  items: [],
  updatedAt: null
};

const DATA_FILES = {
  favorites: "favorites.json",
  settings: "settings.json",
  memory: "memory.json",
  logs: "logs.json",
  routines: "routines.json",
  scheduledTasks: "scheduledTasks.json",
  userProfile: "userProfile.json"
};

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  ensureJsonFile(dataPath(DATA_FILES.settings), DEFAULT_SETTINGS);
  ensureJsonFile(dataPath(DATA_FILES.memory), DEFAULT_MEMORY);
  ensureJsonFile(dataPath(DATA_FILES.logs), DEFAULT_LOGS);
  ensureJsonFile(dataPath(DATA_FILES.favorites), DEFAULT_FAVORITES);
  ensureJsonFile(dataPath(DATA_FILES.routines), DEFAULT_ROUTINES);
  ensureJsonFile(dataPath(DATA_FILES.scheduledTasks), DEFAULT_SCHEDULED_TASKS);
  ensureJsonFile(dataPath(DATA_FILES.userProfile), DEFAULT_USER_PROFILE);
}

function ensureJsonFile(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${JSON.stringify(defaultValue, null, 2)}\n`, "utf8");
    return;
  }

  try {
    JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    const backupPath = `${filePath}.broken-${Date.now()}`;
    fs.copyFileSync(filePath, backupPath);
    fs.writeFileSync(filePath, `${JSON.stringify(defaultValue, null, 2)}\n`, "utf8");
  }
}

function dataPath(fileName) {
  return path.join(DATA_DIR, fileName);
}

function readJson(fileName, fallbackValue) {
  ensureDataFiles();
  try {
    return JSON.parse(fs.readFileSync(dataPath(fileName), "utf8"));
  } catch {
    return clone(fallbackValue);
  }
}

function writeJson(fileName, value) {
  ensureDataFiles();
  writeJsonFile(dataPath(fileName), value);
}

function writeJsonFile(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(tmp, contents, "utf8");

  try {
    fs.renameSync(tmp, target);
  } catch (error) {
    if (!["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
    fs.writeFileSync(target, contents, "utf8");
    fs.rmSync(tmp, { force: true });
  }
}

function getDesktopDir() {
  return firstExistingDir([
    path.join(os.homedir(), "Desktop"),
    path.join(os.homedir(), "Escritorio"),
    path.join(os.homedir(), "OneDrive", "Desktop"),
    path.join(os.homedir(), "OneDrive", "Escritorio")
  ]) || path.join(os.homedir(), "Desktop");
}

function getDownloadsDir() {
  return firstExistingDir([
    path.join(os.homedir(), "Downloads"),
    path.join(os.homedir(), "Descargas")
  ]) || path.join(os.homedir(), "Downloads");
}

function getDocumentsDir() {
  return firstExistingDir([
    path.join(os.homedir(), "Documents"),
    path.join(os.homedir(), "Documentos"),
    path.join(os.homedir(), "OneDrive", "Documents"),
    path.join(os.homedir(), "OneDrive", "Documentos")
  ]) || path.join(os.homedir(), "Documents");
}

function firstExistingDir(candidates) {
  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory();
    } catch {
      return false;
    }
  });
}

function sanitizeFileName(input, fallback = "archivo") {
  const cleaned = String(input || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .slice(0, 80);

  const reservedNames = new Set([
    "con",
    "prn",
    "aux",
    "nul",
    "com1",
    "com2",
    "com3",
    "com4",
    "com5",
    "com6",
    "com7",
    "com8",
    "com9",
    "lpt1",
    "lpt2",
    "lpt3",
    "lpt4",
    "lpt5",
    "lpt6",
    "lpt7",
    "lpt8",
    "lpt9"
  ]);

  const finalName = cleaned.replace(/[. ]+$/g, "") || fallback;
  return reservedNames.has(finalName.toLowerCase()) ? `${finalName}_local` : finalName;
}

function isWithin(baseDir, targetPath) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(`${resolvedBase}${path.sep}`);
}

async function createFolderOnDesktop(folderName) {
  const desktop = getDesktopDir();
  const safeName = sanitizeFileName(folderName, "Nueva carpeta");
  const target = path.join(desktop, safeName);

  if (!isWithin(desktop, target)) {
    throw new Error("La carpeta solicitada no esta dentro del Escritorio.");
  }

  await fsp.mkdir(target, { recursive: false });
  return { path: target, name: safeName };
}

async function listDownloads() {
  const downloads = getDownloadsDir();
  await fsp.mkdir(downloads, { recursive: true });
  const entries = await fsp.readdir(downloads, { withFileTypes: true });
  const visibleEntries = entries
    .filter((entry) => !entry.name.startsWith("."))
    .slice(0, 100);

  return Promise.all(
    visibleEntries.map(async (entry) => {
      const fullPath = path.join(downloads, entry.name);
      const stats = await fsp.stat(fullPath);
      return {
        name: entry.name,
        type: entry.isDirectory() ? "carpeta" : "archivo",
        size: entry.isDirectory() ? null : stats.size,
        modifiedAt: stats.mtime.toISOString()
      };
    })
  );
}

async function findFilesByName(term, options = {}) {
  const normalizedTerm = normalizeText(term);
  const extension = normalizeExtension(options.extension);
  const category = normalizeSearchCategory(options.category);
  const limit = clampSearchLimit(options.limit);
  const roots = Array.isArray(options.roots) && options.roots.length
    ? options.roots.map((root) => path.resolve(String(root)))
    : [getDesktopDir(), getDownloadsDir(), getDocumentsDir()];
  const results = [];
  const seenRoots = new Set();

  for (const root of roots) {
    const resolvedRoot = path.resolve(root);
    if (seenRoots.has(resolvedRoot)) continue;
    seenRoots.add(resolvedRoot);

    if (fs.existsSync(root)) {
      await walkFiles(root, normalizedTerm, results, 0, { category, extension, limit });
    }

    if (results.length >= limit) break;
  }

  return results.slice(0, limit);
}

async function walkFiles(currentDir, normalizedTerm, results, depth, options) {
  if (depth > 4 || results.length >= options.limit || isSensitivePath(currentDir)) return;

  let entries = [];
  try {
    entries = await fsp.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= options.limit) return;
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;

    const fullPath = path.join(currentDir, entry.name);
    if (isSensitivePath(fullPath)) continue;

    const normalizedName = normalizeText(entry.name);
    const matchesName = !normalizedTerm || normalizedName.includes(normalizedTerm);
    const matchesType = entry.isDirectory()
      ? !options.extension && !options.category
      : matchesFileFilter(entry.name, options);

    if (matchesName && matchesType) {
      results.push({
        name: entry.name,
        path: fullPath,
        directory: currentDir,
        extension: entry.isDirectory() ? null : path.extname(entry.name).toLowerCase(),
        type: entry.isDirectory() ? "carpeta" : "archivo"
      });
    }

    if (entry.isDirectory()) {
      await walkFiles(fullPath, normalizedTerm, results, depth + 1, options);
    }
  }
}

function matchesFileFilter(fileName, options) {
  const extension = path.extname(fileName).toLowerCase();
  if (options.extension && extension !== options.extension) return false;
  if (!options.category) return true;

  const categoryExtensions = {
    images: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".heic"],
    documents: [".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".xls", ".xlsx", ".ppt", ".pptx", ".csv"]
  };

  return categoryExtensions[options.category]?.includes(extension) || false;
}

function normalizeExtension(value) {
  const extension = String(value || "").trim().toLowerCase().replace(/^\./, "");
  if (!extension) return null;
  if (!/^[a-z0-9]{1,10}$/.test(extension)) {
    throw new Error("La extension de busqueda no es valida.");
  }
  return `.${extension}`;
}

function normalizeSearchCategory(value) {
  const category = String(value || "").trim().toLowerCase();
  if (!category) return null;
  if (!["images", "documents"].includes(category)) {
    throw new Error("La categoria de busqueda no esta permitida.");
  }
  return category;
}

function clampSearchLimit(value) {
  const number = Number(value || 50);
  if (!Number.isFinite(number)) return 50;
  return Math.min(100, Math.max(1, Math.floor(number)));
}

async function createNote(noteName, text) {
  const desktop = getDesktopDir();
  const notesDir = path.join(desktop, "SAW Local Notes");
  const safeName = sanitizeFileName(noteName, "nota");
  const fileName = safeName.toLowerCase().endsWith(".txt") ? safeName : `${safeName}.txt`;
  const target = await uniquePath(path.join(notesDir, fileName));

  await fsp.mkdir(notesDir, { recursive: true });
  if (!isWithin(notesDir, target)) {
    throw new Error("La nota solicitada no esta dentro de la carpeta de notas.");
  }

  await fsp.writeFile(target, text, "utf8");
  return { path: target, name: path.basename(target) };
}

async function organizeDownloadsByType() {
  const downloads = getDownloadsDir();
  await fsp.mkdir(downloads, { recursive: true });
  const entries = await fsp.readdir(downloads, { withFileTypes: true });
  const moved = [];
  const skipped = [];

  for (const entry of entries) {
    if (entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith(".")) {
      skipped.push({ name: entry.name, reason: "No es un archivo movible." });
      continue;
    }

    const source = path.join(downloads, entry.name);
    if (isSensitivePath(source)) {
      skipped.push({ name: entry.name, reason: "Parece sensible." });
      continue;
    }

    const category = categoryForFile(entry.name);
    const targetDir = path.join(downloads, category);
    await fsp.mkdir(targetDir, { recursive: true });

    const target = await uniquePath(path.join(targetDir, entry.name));
    if (!isWithin(downloads, target)) {
      skipped.push({ name: entry.name, reason: "Ruta destino no permitida." });
      continue;
    }

    await fsp.rename(source, target);
    moved.push({
      name: entry.name,
      from: source,
      to: target,
      category
    });
  }

  return { moved, skipped };
}

function categoryForFile(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const groups = {
    Imagenes: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".heic"],
    Documentos: [".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".xls", ".xlsx", ".ppt", ".pptx", ".csv"],
    Videos: [".mp4", ".mov", ".avi", ".mkv", ".webm", ".wmv"],
    Audio: [".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"],
    Comprimidos: [".zip", ".rar", ".7z", ".tar", ".gz"],
    Codigo: [".js", ".ts", ".html", ".css", ".json", ".py", ".ps1", ".bat", ".cmd"]
  };

  return Object.entries(groups).find(([, extensions]) => extensions.includes(ext))?.[0] || "Otros";
}

async function uniquePath(basePath) {
  if (!fs.existsSync(basePath)) return basePath;

  const dir = path.dirname(basePath);
  const ext = path.extname(basePath);
  const baseName = path.basename(basePath, ext);

  for (let index = 2; index <= 500; index += 1) {
    const candidate = path.join(dir, `${baseName} (${index})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }

  throw new Error("No pude encontrar un nombre de archivo disponible.");
}

function isSensitivePath(targetPath) {
  const normalized = normalizeText(targetPath);
  const sensitiveParts = [
    `${path.sep}.ssh${path.sep}`,
    `${path.sep}.gnupg${path.sep}`,
    `${path.sep}appdata${path.sep}`,
    `${path.sep}node_modules${path.sep}`,
    `${path.sep}.git${path.sep}`,
    "password",
    "contrasena",
    "contraseña",
    "secret",
    "token",
    "credential",
    "api_key",
    ".env",
    "id_rsa",
    "privatekey",
    "private_key"
  ].map(normalizeText);

  return sensitiveParts.some((part) => normalized.includes(part));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  DATA_FILES,
  DEFAULT_FAVORITES,
  DEFAULT_LOGS,
  DEFAULT_MEMORY,
  DEFAULT_ROUTINES,
  DEFAULT_SCHEDULED_TASKS,
  DEFAULT_SETTINGS,
  DEFAULT_USER_PROFILE,
  categoryForFile,
  createFolderOnDesktop,
  createNote,
  dataPath,
  ensureDataFiles,
  findFilesByName,
  getDesktopDir,
  getDocumentsDir,
  getDownloadsDir,
  isSensitivePath,
  isWithin,
  listDownloads,
  matchesFileFilter,
  organizeDownloadsByType,
  readJson,
  sanitizeFileName,
  writeJsonFile,
  writeJson
};
