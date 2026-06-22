const SENSITIVE_PATTERNS = [
  {
    type: "private_key",
    label: "posible clave privada",
    description: "El texto parece contener una clave privada.",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i
  },
  {
    type: "email",
    label: "email",
    description: "El texto contiene una direccion de email.",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
  },
  {
    type: "password",
    label: "contrasena",
    description: "El texto parece contener una contrasena o clave personal.",
    pattern: /\b(password|passwd|pass|contrasena|contraseña|clave)\b\s*(=|:|es)\s*\S{3,}/i
  },
  {
    type: "api_key",
    label: "token o API key",
    description: "El texto parece contener un token, secreto o API key.",
    pattern: /\b(api[_\s-]?key|token|secret|bearer)\b\s*(=|:)\s*[A-Za-z0-9_\-./=]{8,}/i
  },
  {
    type: "api_key",
    label: "token o API key",
    description: "El texto parece contener un token conocido.",
    pattern: /\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|npm_[A-Za-z0-9]{16,})\b/i
  },
  {
    type: "api_key",
    label: "token o API key",
    description: "El texto contiene una cadena larga que podria ser un secreto.",
    pattern: /\b[A-Za-z0-9_-]{36,}\b/
  },
  {
    type: "personal_path",
    label: "ruta personal",
    description: "El texto contiene una ruta local de usuario.",
    pattern: /\b[A-Za-z]:[\\/](Users|Usuarios)[\\/][^\\/\s]+(?:[\\/][^\s]*)?/i
  },
  {
    type: "personal_path",
    label: "ruta personal",
    description: "El texto contiene una ruta local de usuario.",
    pattern: /(^|\s)(~[\\/]|\/Users\/[^\s/]+|\/home\/[^\s/]+)/i
  }
];

function detectSensitiveText(text) {
  const value = String(text || "");
  const findings = [];
  const seenTypes = new Set();

  for (const rule of SENSITIVE_PATTERNS) {
    if (rule.pattern.test(value) && !seenTypes.has(rule.type)) {
      seenTypes.add(rule.type);
      findings.push({
        type: rule.type,
        label: rule.label,
        description: rule.description
      });
    }
  }

  if (hasLongNumber(value) && !seenTypes.has("long_number")) {
    findings.push({
      type: "long_number",
      label: "numero largo",
      description: "El texto contiene un numero largo que podria ser privado."
    });
  }

  return {
    sensitive: findings.length > 0,
    findings
  };
}

function hasLongNumber(value) {
  const candidates = String(value || "").match(/(?:\d[\s-]?){9,}/g) || [];
  return candidates.some((candidate) => candidate.replace(/\D/g, "").length >= 9);
}

module.exports = {
  detectSensitiveText
};
