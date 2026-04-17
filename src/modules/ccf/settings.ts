import { getPref } from "../../utils/prefs";

const DEFAULT_MIN_MATCH_SCORE = 760;
const MIN_ALLOWED_SCORE = 600;
const MAX_ALLOWED_SCORE = 1000;

export interface CustomAliasRule {
  alias: string;
  target: string;
}

let aliasRuleCache: {
  raw: string;
  hash: string;
  rules: CustomAliasRule[];
} | null = null;

function readPref<K extends keyof _ZoteroTypes.Prefs["PluginPrefsMap"]>(
  key: K,
  fallback: _ZoteroTypes.Prefs["PluginPrefsMap"][K],
) {
  try {
    const value = getPref(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function clampMinMatchScore(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_MIN_MATCH_SCORE;
  return Math.min(
    MAX_ALLOWED_SCORE,
    Math.max(MIN_ALLOWED_SCORE, Math.round(value)),
  );
}

export function getCCFSettings() {
  return {
    autoLookupEnabled: readPref("autoLookupEnabled", true),
    writeCacheToExtra: readPref("writeCacheToExtra", true),
    minMatchScore: clampMinMatchScore(
      Number(readPref("minMatchScore", DEFAULT_MIN_MATCH_SCORE)),
    ),
    showAbbrColumn: readPref("showAbbrColumn", true),
    enableDebugLog: readPref("enableDebugLog", false),
    customAliasRules: readPref("customAliasRules", ""),
  };
}

export function parseCustomAliasRules(rawText: string) {
  const rules: CustomAliasRule[] = [];

  rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line) => {
      if (!line || line.startsWith("#")) return;

      const match = line.match(/^(.*?)\s*(?:=>|->|=)\s*(.*?)$/);
      if (!match) return;

      const alias = match[1].trim();
      const target = match[2].trim();
      if (!alias || !target) return;

      rules.push({ alias, target });
    });

  return rules;
}

export function getCustomAliasRules() {
  const raw = String(getCCFSettings().customAliasRules || "");
  const normalized = normalizeAliasRules(raw);
  const hash = hashString(normalized);

  if (
    aliasRuleCache &&
    aliasRuleCache.raw === raw &&
    aliasRuleCache.hash === hash
  ) {
    return aliasRuleCache.rules;
  }

  const rules = parseCustomAliasRules(raw);
  aliasRuleCache = { raw, hash, rules };
  return rules;
}

export function getCustomAliasRulesHash() {
  return hashString(
    normalizeAliasRules(String(getCCFSettings().customAliasRules || "")),
  );
}

function normalizeAliasRules(rawText: string) {
  return parseCustomAliasRules(rawText)
    .map((rule) => `${rule.alias}=>${rule.target}`)
    .join("\n");
}

function hashString(input: string) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export { DEFAULT_MIN_MATCH_SCORE, MAX_ALLOWED_SCORE, MIN_ALLOWED_SCORE };
