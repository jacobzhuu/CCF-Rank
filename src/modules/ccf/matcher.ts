import ccfData from "../../data/ccf-conferences.json";
import { safeLog } from "./logging";
import {
  getCCFSettings,
  getCustomAliasRules,
  getCustomAliasRulesHash,
} from "./settings";
import type {
  CCFComputedMatch,
  CCFEntry,
  CCFMatchField,
  CCFMatchStrategy,
  EntryKind,
} from "./types";

interface IndexedEntry {
  entry: CCFEntry;
  kind: EntryKind;
  normalizedFullName: string;
  fullTokens: Set<string>;
  aliases: string[];
}

interface PickedCandidate {
  indexed: IndexedEntry;
  score: number;
}

const GENERIC_TOKENS = new Set([
  "acm",
  "and",
  "annual",
  "architecture",
  "architectural",
  "association",
  "computer",
  "conference",
  "design",
  "for",
  "ieee",
  "in",
  "international",
  "journal",
  "on",
  "of",
  "proceedings",
  "sig",
  "sigact",
  "sigplan",
  "sigsoft",
  "symposium",
  "systems",
  "the",
  "theory",
  "to",
  "transactions",
  "workshop",
]);

const INVALID_ABBRS = new Set([
  "DBLP",
  "INTERNATIONAL",
  "PROCEEDINGS",
  "SYMPOSIUM",
  "CONFERENCE",
  "JOURNAL",
  "TRANSACTIONS",
]);

export const CCF_DATA_VERSION = String((ccfData as any).version || "unknown");

export class CCFRankMatcher {
  private conferences: CCFEntry[];
  private journals: CCFEntry[];
  private exactAbbrMap = new Map<string, IndexedEntry[]>();
  private exactFullNameMap = new Map<string, IndexedEntry[]>();
  private indexedEntries: IndexedEntry[] = [];
  private memoCache = new Map<string, CCFComputedMatch | null>();

  constructor() {
    this.conferences = (ccfData as any).conferences || [];
    this.journals = (ccfData as any).journals || [];
    this.buildIndexes();
  }

  clearMemoCache() {
    this.memoCache.clear();
  }

  getEntry(name: string, preferredKind?: EntryKind): CCFEntry | null {
    return this.getMatch(name, preferredKind)?.entry || null;
  }

  getMatch(name: string, preferredKind?: EntryKind): CCFComputedMatch | null {
    if (!name) return null;

    const settings = getCCFSettings();
    const cacheKey = [
      name,
      preferredKind || "none",
      settings.minMatchScore,
      getCustomAliasRulesHash(),
    ].join("::");
    if (this.memoCache.has(cacheKey)) {
      return this.memoCache.get(cacheKey) || null;
    }

    const result = this.findMatch(name, preferredKind);
    this.memoCache.set(cacheKey, result);
    return result;
  }

  getEntryFromItem(item: Zotero.Item): CCFEntry | null {
    return this.getMatchFromItem(item)?.entry || null;
  }

  getMatchFromItem(item: Zotero.Item): CCFComputedMatch | null {
    if (!item) return null;

    try {
      if (item.itemType === "conferencePaper") {
        const proceedingsTitle = item.getField("proceedingsTitle") as string;
        if (proceedingsTitle) {
          const match = this.getMatch(proceedingsTitle, "conference");
          if (match) {
            return this.withField(match, "proceedingsTitle", proceedingsTitle);
          }
        }

        const publicationTitle = item.getField("publicationTitle") as string;
        if (publicationTitle) {
          const match = this.getMatch(publicationTitle, "conference");
          if (match) {
            return this.withField(match, "publicationTitle", publicationTitle);
          }
        }

        const conferenceName = item.getField("conferenceName") as string;
        if (conferenceName) {
          const match = this.getMatch(conferenceName, "conference");
          if (match) {
            return this.withField(match, "conferenceName", conferenceName);
          }
        }
      }

      if (item.itemType === "journalArticle") {
        const publicationTitle = item.getField("publicationTitle") as string;
        if (publicationTitle) {
          const match = this.getMatch(publicationTitle, "journal");
          if (match) {
            return this.withField(match, "publicationTitle", publicationTitle);
          }
        }
      }

      const publicationTitle = item.getField("publicationTitle") as string;
      if (publicationTitle) {
        const match = this.getMatch(publicationTitle);
        if (match) {
          return this.withField(match, "publicationTitle", publicationTitle);
        }
      }

      const title = item.getField("title") as string;
      if (title) {
        const match = this.getMatch(title);
        if (match) {
          return this.withField(match, "title", title);
        }
      }
    } catch (e) {
      safeLog("Error getting CCF rank:", e);
    }

    return null;
  }

  private findMatch(
    name: string,
    preferredKind?: EntryKind,
  ): CCFComputedMatch | null {
    const original = name.trim();
    const stripped = this.removeBoilerplate(original);
    const normalizedInput = this.normalizeText(stripped);
    const inputAbbr = this.normalizeAbbr(stripped);
    const inputTokens = this.tokenizeMeaningful(normalizedInput);

    const customAliasMatch = this.matchCustomAlias(
      stripped,
      normalizedInput,
      inputAbbr,
      preferredKind,
    );
    if (customAliasMatch) {
      return customAliasMatch;
    }

    for (const abbr of this.extractCandidateAbbrs(original)) {
      const candidates = this.exactAbbrMap.get(abbr) || [];
      const picked = this.pickBestCandidate(
        candidates,
        stripped,
        normalizedInput,
        inputTokens,
        preferredKind,
      );
      if (picked) {
        return this.toComputedMatch(picked, "extracted-abbr");
      }
    }

    const abbrCandidates = this.exactAbbrMap.get(inputAbbr) || [];
    const pickedByAbbr = this.pickBestCandidate(
      abbrCandidates,
      stripped,
      normalizedInput,
      inputTokens,
      preferredKind,
    );
    if (pickedByAbbr) {
      return this.toComputedMatch(pickedByAbbr, "abbr-exact");
    }

    const leadingToken = stripped.match(/^([A-Za-z][A-Za-z0-9+/-]{1,})\b/);
    if (leadingToken) {
      const tokenKey = this.normalizeAbbr(leadingToken[1]);
      if (
        !new Set(["ACM", "IEEE", "INTERNATIONAL", "PROCEEDINGS"]).has(tokenKey)
      ) {
        const picked = this.pickBestCandidate(
          this.exactAbbrMap.get(tokenKey) || [],
          stripped,
          normalizedInput,
          inputTokens,
          preferredKind,
        );
        if (picked) {
          return this.toComputedMatch(picked, "leading-token");
        }
      }
    }

    const fullNameCandidates = this.exactFullNameMap.get(normalizedInput) || [];
    const pickedByFullName = this.pickBestCandidate(
      fullNameCandidates,
      stripped,
      normalizedInput,
      inputTokens,
      preferredKind,
    );
    if (pickedByFullName) {
      return this.toComputedMatch(pickedByFullName, "full-name-exact");
    }

    let best: PickedCandidate | null = null;
    for (const indexed of this.indexedEntries) {
      const score = this.scoreEntry(
        stripped,
        normalizedInput,
        inputTokens,
        indexed,
      );
      const hintedKind =
        preferredKind || this.classifyInputHint(normalizedInput);
      const adjusted =
        hintedKind && indexed.kind === hintedKind ? score + 120 : score;
      if (!best || adjusted > best.score) {
        best = { indexed, score: adjusted };
      }
    }

    if (best && best.score >= getCCFSettings().minMatchScore) {
      return this.toComputedMatch(best, "fuzzy");
    }

    safeLog(
      `[CCF Match] No match found for: "${normalizedInput}" (bestScore=${best?.score || 0})`,
    );
    return null;
  }

  private matchCustomAlias(
    rawInput: string,
    normalizedInput: string,
    inputAbbr: string,
    preferredKind?: EntryKind,
  ): CCFComputedMatch | null {
    for (const rule of getCustomAliasRules()) {
      const normalizedAlias = this.normalizeText(rule.alias);
      const aliasAbbr = this.normalizeAbbr(rule.alias);
      const matchesText =
        normalizedInput === normalizedAlias ||
        this.containsAlias(normalizedInput, normalizedAlias);
      const matchesAbbr = aliasAbbr && inputAbbr === aliasAbbr;

      if (!matchesText && !matchesAbbr) {
        continue;
      }

      const target = this.resolveRuleTarget(rule.target, preferredKind);
      if (!target) {
        safeLog(`[CCF Match] Invalid custom alias target: ${rule.target}`);
        continue;
      }

      safeLog(
        `[CCF Match] Found by custom alias: ${rule.alias} -> ${target.entry.abbr}`,
      );
      return {
        entry: target.entry,
        score: 1000,
        confidence: 100,
        strategy: "custom-alias",
        matchedAlias: rule.alias,
        matchedValue: rawInput,
      };
    }

    return null;
  }

  private resolveRuleTarget(target: string, preferredKind?: EntryKind) {
    const targetAbbr = this.normalizeAbbr(target);
    const targetFullName = this.normalizeText(target);
    const targetTokens = this.tokenizeMeaningful(targetFullName);
    const candidates = new Map<string, IndexedEntry>();

    (this.exactAbbrMap.get(targetAbbr) || []).forEach((indexed) => {
      candidates.set(`${indexed.kind}:${indexed.entry.abbr}`, indexed);
    });
    (this.exactFullNameMap.get(targetFullName) || []).forEach((indexed) => {
      candidates.set(`${indexed.kind}:${indexed.entry.abbr}`, indexed);
    });

    const picked = this.pickBestCandidate(
      Array.from(candidates.values()),
      target,
      targetFullName,
      targetTokens,
      preferredKind,
    );
    return picked?.indexed || null;
  }

  private withField(
    match: CCFComputedMatch,
    matchedField: CCFMatchField,
    matchedValue: string,
  ): CCFComputedMatch {
    return {
      ...match,
      matchedField,
      matchedValue,
    };
  }

  private toComputedMatch(
    picked: PickedCandidate,
    strategy: CCFMatchStrategy,
  ): CCFComputedMatch {
    return {
      entry: picked.indexed.entry,
      score: picked.score,
      confidence: this.scoreToConfidence(picked.score),
      strategy,
    };
  }

  private scoreToConfidence(score: number) {
    return Math.min(100, Math.max(60, Math.round(score / 10)));
  }

  private normalizeText(input: string) {
    return input
      .toLowerCase()
      .replace(/\b([a-z]+)\s*['’]\d{2,4}\b/g, "$1")
      .replace(/[“”"'’`]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9+/\-\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private normalizeAbbr(input: string) {
    return input
      .toUpperCase()
      .replace(/[“”"'’`]/g, "")
      .replace(/[^A-Z0-9+/\-\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private isMeaningfulToken(token: string) {
    if (token.length < 3) return false;
    if (GENERIC_TOKENS.has(token)) return false;
    return true;
  }

  private tokenizeMeaningful(input: string) {
    return new Set(
      input
        .split(" ")
        .filter((token) => this.isMeaningfulToken(token.toLowerCase())),
    );
  }

  private isUsableAlias(alias: string) {
    const normalized = this.normalizeAbbr(alias);
    if (!normalized || normalized.length < 2) return false;
    if (INVALID_ABBRS.has(normalized)) return false;

    const tokens = normalized.split(" ").filter(Boolean);
    if (tokens.length > 0) {
      const allGeneric = tokens.every((token) =>
        GENERIC_TOKENS.has(token.toLowerCase()),
      );
      if (allGeneric) return false;
    }

    return true;
  }

  private extractCandidateAbbrs(input: string) {
    const candidates = new Set<string>();

    const bracketed = input.matchAll(/\(([A-Za-z][A-Za-z0-9+/-]{1,})\)/g);
    for (const match of bracketed) {
      candidates.add(this.normalizeAbbr(match[1]));
    }

    const yearStyle = input.match(
      /^\s*([A-Za-z][A-Za-z0-9+/-]{1,})\s*['’]\d{2,4}\b/,
    );
    if (yearStyle) {
      candidates.add(this.normalizeAbbr(yearStyle[1]));
    }

    return Array.from(candidates).filter((candidate) => candidate.length >= 2);
  }

  private classifyInputHint(normalizedInput: string): EntryKind | null {
    const words = new Set(normalizedInput.split(" "));
    const conferenceHints = [
      "conference",
      "symposium",
      "workshop",
      "proceedings",
    ];
    const journalHints = ["journal", "transactions", "letters"];

    const hasConferenceHint = conferenceHints.some((value) => words.has(value));
    const hasJournalHint = journalHints.some((value) => words.has(value));

    if (hasConferenceHint && !hasJournalHint) return "conference";
    if (hasJournalHint && !hasConferenceHint) return "journal";
    return null;
  }

  private removeBoilerplate(input: string) {
    return input
      .replace(/^proceedings of (the )?/i, "")
      .replace(/^proc\.? of (the )?/i, "")
      .replace(/^in:\s*/i, "")
      .replace(/^\d{4}\s+/, "")
      .replace(/\s*\(.*?\)\s*$/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private generateAbbrAliases(abbr: string) {
    const aliases = new Set<string>();
    const base = this.normalizeAbbr(abbr);
    if (!this.isUsableAlias(base)) return [];

    aliases.add(base);
    aliases.add(base.replace(/\s+/g, ""));

    const prefixPattern = /^(INTERNATIONAL|IEEE|ACM|EUROPEAN|THE)\s+/;
    let stripped = base;
    while (prefixPattern.test(stripped)) {
      stripped = stripped.replace(prefixPattern, "").trim();
      if (this.isUsableAlias(stripped)) {
        aliases.add(stripped);
        aliases.add(stripped.replace(/\s+/g, ""));
      }
    }

    return Array.from(aliases).filter((alias) => this.isUsableAlias(alias));
  }

  private containsAlias(normalizedInput: string, alias: string) {
    const escaped = alias
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    return re.test(normalizedInput);
  }

  private scoreEntry(
    inputText: string,
    normalizedInput: string,
    inputTokens: Set<string>,
    indexed: IndexedEntry,
  ) {
    let score = 0;

    if (normalizedInput === indexed.normalizedFullName) {
      return 1000;
    }

    for (const alias of indexed.aliases) {
      if (!this.isUsableAlias(alias)) continue;
      const lowerAlias = alias.toLowerCase();
      if (this.containsAlias(normalizedInput, alias)) {
        score = Math.max(score, 900 + Math.min(50, alias.length));
      }

      if (lowerAlias.length >= 4 && normalizedInput.includes(lowerAlias)) {
        score = Math.max(score, 820 + Math.min(30, alias.length));
      }
    }

    if (normalizedInput.includes(indexed.normalizedFullName)) {
      score = Math.max(score, 780);
    }

    let overlap = 0;
    for (const token of inputTokens) {
      if (indexed.fullTokens.has(token)) {
        overlap += 1;
      }
    }

    if (overlap >= 3) {
      const precision = overlap / Math.max(1, inputTokens.size);
      const recall = overlap / Math.max(1, indexed.fullTokens.size);
      const f1 =
        (2 * precision * recall) / Math.max(0.0001, precision + recall);
      score = Math.max(score, 600 + Math.round(f1 * 200));
    }

    if (
      this.isUsableAlias(indexed.entry.abbr) &&
      inputText.toUpperCase().includes(indexed.entry.abbr.toUpperCase())
    ) {
      score += 10;
    }

    return score;
  }

  private pickBestCandidate(
    candidates: IndexedEntry[],
    rawInput: string,
    normalizedInput: string,
    inputTokens: Set<string>,
    preferredKind?: EntryKind,
  ): PickedCandidate | null {
    if (candidates.length === 0) return null;

    const hintedKind = preferredKind || this.classifyInputHint(normalizedInput);
    let best: PickedCandidate | null = null;
    let secondBestScore = -1;

    for (const candidate of candidates) {
      let score = this.scoreEntry(
        rawInput,
        normalizedInput,
        inputTokens,
        candidate,
      );

      if (hintedKind && candidate.kind === hintedKind) {
        score += 160;
      }

      if (
        normalizedInput === candidate.normalizedFullName ||
        normalizedInput.includes(candidate.normalizedFullName)
      ) {
        score += 120;
      }

      if (!best || score > best.score) {
        secondBestScore = best?.score ?? -1;
        best = { indexed: candidate, score };
      } else if (score > secondBestScore) {
        secondBestScore = score;
      }
    }

    const veryShort = normalizedInput.replace(/\s+/g, "").length <= 8;
    if (veryShort && best && best.score - secondBestScore < 80) {
      return null;
    }

    return best;
  }

  private buildIndexes() {
    const allEntries: Array<{ entry: CCFEntry; kind: EntryKind }> = [
      ...this.conferences.map((entry) => ({
        entry,
        kind: "conference" as const,
      })),
      ...this.journals.map((entry) => ({
        entry,
        kind: "journal" as const,
      })),
    ];

    allEntries.forEach(({ entry, kind }) => {
      const normalizedFullName = this.normalizeText(entry.fullName);
      const fullTokens = this.tokenizeMeaningful(normalizedFullName);
      const aliases = this.generateAbbrAliases(entry.abbr);
      const indexed: IndexedEntry = {
        entry,
        kind,
        normalizedFullName,
        fullTokens,
        aliases,
      };

      const fullNameEntries =
        this.exactFullNameMap.get(normalizedFullName) || [];
      fullNameEntries.push(indexed);
      this.exactFullNameMap.set(normalizedFullName, fullNameEntries);

      aliases.forEach((alias) => {
        const abbrEntries = this.exactAbbrMap.get(alias) || [];
        abbrEntries.push(indexed);
        this.exactAbbrMap.set(alias, abbrEntries);
      });

      this.indexedEntries.push(indexed);
    });
  }
}
