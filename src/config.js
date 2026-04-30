"use strict";

const fs = require("fs");
const path = require("path");

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeConfig(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (Array.isArray(value)) {
      out[key] = value.slice();
      continue;
    }
    if (isPlainObject(value) && isPlainObject(base[key])) {
      out[key] = mergeConfig(base[key], value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function loadConfig({ repoRoot }) {
  const defaultsPath = path.join(__dirname, "..", ".ai-reviewer.json");
  const defaults = readJsonIfExists(defaultsPath) || {};

  const repoConfigPath = repoRoot
    ? path.join(repoRoot, ".ai-reviewer.json")
    : null;
  const repoConfig = repoConfigPath ? readJsonIfExists(repoConfigPath) : null;

  const merged = mergeConfig(defaults, repoConfig || {});

  if (process.env.OLLAMA_HOST)
    merged.ollama = mergeConfig(merged.ollama || {}, {
      baseUrl: process.env.OLLAMA_HOST,
    });
  if (process.env.OLLAMA_MODEL)
    merged.ollama = mergeConfig(merged.ollama || {}, {
      model: process.env.OLLAMA_MODEL,
    });

  return { config: merged, paths: { defaultsPath, repoConfigPath } };
}

module.exports = { loadConfig };
