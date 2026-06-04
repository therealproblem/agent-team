#!/usr/bin/env node
/**
 * Smoke-test an OpenAI-compatible custom AI provider without printing secrets.
 *
 * Usage:
 *   pnpm test:ai-provider -- --provider ./provider.json --dry-run
 *   pnpm test:ai-provider -- --provider MY_PROVIDER --model openai/gpt-5-mini --prompt "Reply with ok"
 *   node scripts/test-ai-provider.mjs --provider ./provider.json --model my-model --dry-run
 *
 * Provider config can be passed as:
 *   1. A JSON file path containing one provider object or a map of provider aliases.
 *   2. A provider alias resolved from PI_MODELS_JSON, PI_MODELS_PATH, or common
 *      Pi models.json locations.
 *
 * Supported provider fields intentionally mirror common Pi models.json-style
 * entries while staying permissive:
 *   {
 *     "name": "MY_PROVIDER",
 *     "type": "openai-responses" | "openai-completions" | "openai-compatible",
 *     "baseURL": "https://api.example.com/v1",
 *     "apiKeyEnv": "MY_PROVIDER_API_KEY",
 *     "defaultModel": "vendor/model-id",
 *     "headers": { "X-Provider": "example" }
 *   }
 *
 * Equivalent key spellings are accepted: baseUrl/base_url/apiBaseURL/api_base_url,
 * apiKeyEnv/api_key_env/keyEnv/authEnv/tokenEnv, defaultModel/model/modelId.
 * Secret values must live in environment variables; this script never prints
 * environment values, API keys, bearer tokens, or provider credentials.
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PROMPT = "Reply with exactly: provider smoke test ok";
const SECRET_FIELD_RE = /(api[_-]?key|token|secret|password|credential|bearer|authorization)/i;

function parseArgs(argv) {
  if (argv[0] === "--") argv = argv.slice(1);

  const args = {
    provider: undefined,
    model: undefined,
    prompt: DEFAULT_PROMPT,
    dryRun: false,
    help: false,
    timeoutMs: 30000,
    config: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--provider") args.provider = requireValue(argv, ++i, arg);
    else if (arg.startsWith("--provider=")) args.provider = arg.slice("--provider=".length);
    else if (arg === "--config") args.config = requireValue(argv, ++i, arg);
    else if (arg.startsWith("--config=")) args.config = arg.slice("--config=".length);
    else if (arg === "--model") args.model = requireValue(argv, ++i, arg);
    else if (arg.startsWith("--model=")) args.model = arg.slice("--model=".length);
    else if (arg === "--prompt") args.prompt = requireValue(argv, ++i, arg);
    else if (arg.startsWith("--prompt=")) args.prompt = arg.slice("--prompt=".length);
    else if (arg === "--timeout-ms") args.timeoutMs = Number(requireValue(argv, ++i, arg));
    else if (arg.startsWith("--timeout-ms=")) args.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    else throw new UsageError(`Unknown flag: ${arg}`);
  }

  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    throw new UsageError("--timeout-ms must be a positive number");
  }

  return args;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new UsageError(`${flag} requires a value`);
  return value;
}

class UsageError extends Error {}

function printHelp() {
  console.log(`Custom AI provider smoke test\n\nUsage:\n  pnpm test:ai-provider -- --provider <alias-or-json> [--model <model>] [--prompt <text>] [--dry-run]\n\nExamples:\n  pnpm test:ai-provider -- --provider ./provider.json --dry-run\n  pnpm test:ai-provider -- --provider MY_PROVIDER --model openai/gpt-5-mini\n\nOptions:\n  --provider      Provider alias from models.json, or path to a JSON provider file.\n  --config        Optional explicit models.json path when --provider is an alias.\n  --model         Model id. Defaults to provider defaultModel/model/modelId when present.\n  --prompt        Prompt for a live smoke call. Default is a short deterministic prompt.\n  --dry-run       Resolve config and env-var names only; do not call the provider.\n  --timeout-ms    Request timeout in milliseconds. Default: 30000.\n  --help          Show this help.\n\nSafety:\n  Secret values are never printed. Put credentials in env vars referenced by\n  apiKeyEnv/api_key_env/keyEnv/authEnv/tokenEnv. Missing secrets are reported\n  by env var name only.`);
}

function loadDotenv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function resolveProvider(providerArg, configPath) {
  if (!providerArg) throw new UsageError("--provider is required");

  const providerAsPath = resolve(process.cwd(), providerArg);
  if (existsSync(providerAsPath)) {
    const json = readJson(providerAsPath);
    return pickProviderFromJson(json, undefined, providerAsPath);
  }

  const explicitPath = configPath ? resolve(process.cwd(), configPath) : undefined;
  const modelsPath = explicitPath ?? findModelsJson();
  if (!modelsPath) {
    throw new UsageError(
      `Provider alias '${providerArg}' needs a models.json file. Pass --config <path> or set PI_MODELS_JSON/PI_MODELS_PATH.`,
    );
  }

  const json = readJson(modelsPath);
  return pickProviderFromJson(json, providerArg, modelsPath);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new UsageError(`Could not parse JSON at ${safePath(path)}: ${error.message}`);
  }
}

function findModelsJson() {
  const candidates = [
    process.env.PI_MODELS_JSON,
    process.env.PI_MODELS_PATH,
    join(process.cwd(), ".pi", "models.json"),
    join(process.cwd(), "models.json"),
    join(homeDir(), ".pi", "models.json"),
    join(homeDir(), ".config", "pi", "models.json"),
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate));
}

function homeDir() {
  return process.env.HOME || dirname(fileURLToPath(import.meta.url));
}

function pickProviderFromJson(json, alias, sourcePath) {
  if (Array.isArray(json)) {
    if (!alias && json.length === 1) return withMeta(json[0], aliasOf(json[0]), sourcePath);
    const found = json.find((entry) => aliasMatches(entry, alias));
    if (found) return withMeta(found, alias, sourcePath);
  }

  if (json && typeof json === "object") {
    if (looksLikeProvider(json) && (!alias || aliasMatches(json, alias))) {
      return withMeta(json, aliasOf(json) || alias, sourcePath);
    }

    const containers = [json.providers, json.provider, json.models, json.modelProviders, json.model_providers, json];
    for (const container of containers) {
      const found = pickFromContainer(container, alias);
      if (found) return withMeta(found.provider, found.alias, sourcePath);
    }
  }

  const suffix = alias ? ` for alias '${alias}'` : "";
  throw new UsageError(`Could not find a provider entry${suffix} in ${safePath(sourcePath)}`);
}

function pickFromContainer(container, alias) {
  if (!container) return undefined;
  if (Array.isArray(container)) {
    const provider = alias ? container.find((entry) => aliasMatches(entry, alias)) : container[0];
    return provider ? { provider, alias: alias || aliasOf(provider) } : undefined;
  }
  if (typeof container === "object") {
    if (alias && container[alias]) return { provider: container[alias], alias };
    for (const [key, value] of Object.entries(container)) {
      if (value && typeof value === "object" && (!alias || aliasMatches(value, alias) || key === alias)) {
        return { provider: { name: key, ...value }, alias: key };
      }
    }
  }
  return undefined;
}

function looksLikeProvider(value) {
  return Boolean(value && typeof value === "object" && (value.baseURL || value.baseUrl || value.base_url || value.apiBaseURL || value.api_base_url));
}

function aliasMatches(entry, alias) {
  if (!alias) return true;
  return [entry?.name, entry?.alias, entry?.id, entry?.provider, entry?.providerAlias].filter(Boolean).includes(alias);
}

function aliasOf(entry) {
  return entry?.name || entry?.alias || entry?.id || entry?.provider || entry?.providerAlias;
}

function withMeta(provider, alias, sourcePath) {
  return { provider, alias: alias || aliasOf(provider) || "(unnamed)", sourcePath };
}

function normalizeProvider(provider, cliModel) {
  const baseURL = first(provider, ["baseURL", "baseUrl", "base_url", "apiBaseURL", "api_base_url", "endpoint", "url"]);
  const apiKeyEnv = first(provider, ["apiKeyEnv", "api_key_env", "keyEnv", "authEnv", "tokenEnv", "envKey", "env"]);
  const model = cliModel || first(provider, ["defaultModel", "default_model", "model", "modelId", "model_id"]);
  const type = String(first(provider, ["type", "kind", "adapter"]) || "openai-compatible").toLowerCase();
  const headers = provider.headers && typeof provider.headers === "object" ? provider.headers : {};

  if (!baseURL) throw new UsageError("Provider config is missing baseURL/baseUrl/base_url/apiBaseURL/api_base_url");
  if (!apiKeyEnv) throw new UsageError("Provider config is missing apiKeyEnv/api_key_env/keyEnv/authEnv/tokenEnv");
  if (!model) throw new UsageError("No model supplied. Pass --model or add defaultModel/model/modelId to provider config.");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) throw new UsageError("Provider credential env var name is invalid");

  const unsafeHeaderKeys = Object.keys(headers).filter((key) => SECRET_FIELD_RE.test(key));
  if (unsafeHeaderKeys.length > 0) {
    throw new UsageError(`Move secret header values to env vars instead of provider headers: ${unsafeHeaderKeys.join(", ")}`);
  }

  return { baseURL: String(baseURL).replace(/\/+$/, ""), apiKeyEnv, model: String(model), type, headers };
}

function first(object, keys) {
  for (const key of keys) {
    if (object?.[key] !== undefined && object[key] !== null && object[key] !== "") return object[key];
  }
  return undefined;
}

function safePath(path) {
  return path ? basename(path) : "(unknown)";
}

function endpointFor(provider) {
  if (provider.type.includes("response")) return `${provider.baseURL}/responses`;
  if (provider.baseURL.endsWith("/chat/completions") || provider.baseURL.endsWith("/responses")) return provider.baseURL;
  return `${provider.baseURL}/chat/completions`;
}

function bodyFor(provider, prompt) {
  if (provider.type.includes("response")) {
    return { model: provider.model, input: prompt, max_output_tokens: 32 };
  }
  return {
    model: provider.model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 32,
    temperature: 0,
  };
}

function summarizeResponse(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const message = data?.choices?.[0]?.message?.content;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.map((part) => part?.text || part?.content || "").join(" ").trim();
  const text = data?.choices?.[0]?.text;
  if (typeof text === "string") return text;
  return "response received";
}

async function smokeCall(provider, prompt, timeoutMs) {
  const secret = process.env[provider.apiKeyEnv];
  if (!secret) throw new UsageError(`Missing required env var: ${provider.apiKeyEnv}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpointFor(provider), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
        ...provider.headers,
      },
      body: JSON.stringify(bodyFor(provider, prompt)),
    });

    if (!res.ok) {
      const body = await safeErrorBody(res);
      throw new Error(`HTTP ${res.status}${body ? `: ${body}` : ""}`);
    }

    const data = await res.json();
    return summarizeResponse(data).replace(/\s+/g, " ").slice(0, 160);
  } finally {
    clearTimeout(timeout);
  }
}

async function safeErrorBody(res) {
  const text = await res.text().catch(() => "");
  if (!text) return "";
  return redact(text).slice(0, 300);
}

function redact(text) {
  return String(text)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/(api[_-]?key|token|secret|password|credential)([\"'\s:=]+)([^\s\"',}]+)/gi, "$1$2[REDACTED]");
}

function printResolved(meta, provider, dryRun) {
  console.log(`${dryRun ? "DRY RUN OK" : "CONFIG OK"}: provider '${meta.alias}' resolved from ${safePath(meta.sourcePath)}`);
  console.log(`Model: ${provider.model}`);
  console.log(`Credential env var: ${provider.apiKeyEnv}`);
  console.log(`Endpoint: ${endpointFor(provider).replace(/^https?:\/\/[^/]+/i, "[host]")}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  loadDotenv();
  const meta = resolveProvider(args.provider, args.config);
  const provider = normalizeProvider(meta.provider, args.model);
  printResolved(meta, provider, args.dryRun);

  if (args.dryRun) return;

  const summary = await smokeCall(provider, args.prompt, args.timeoutMs);
  console.log(`SMOKE OK: response received (${summary.length} chars)`);
}

main().catch((error) => {
  const prefix = error instanceof UsageError ? "USAGE" : "SMOKE FAILED";
  console.error(`${prefix}: ${redact(error.message)}`);
  process.exitCode = 1;
});
