import { CCF_DATA_VERSION } from "./matcher";
import { getCCFSettings, getCustomAliasRulesHash } from "./settings";
import { safeLog } from "./logging";
import type { CCFCachedRecord, CCFComputedMatch, CCFEntry } from "./types";

export const CCF_INTERNAL_NOTIFIER_KEY = "ccfRankInternalWrite";

export class CCFCacheService {
  private static readonly RANK_KEY = "CCF-Rank:";
  private static readonly CATEGORY_KEY = "CCF-Category:";
  private static readonly ABBR_KEY = "CCF-Abbr:";
  private static readonly VERSION_KEY = "CCF-Version:";
  private static readonly FINGERPRINT_KEY = "CCF-Fingerprint:";
  private static readonly MIN_SCORE_KEY = "CCF-MinScore:";
  private static readonly RULES_HASH_KEY = "CCF-RulesHash:";
  private static readonly CONFIDENCE_KEY = "CCF-Confidence:";
  private static readonly STRATEGY_KEY = "CCF-Strategy:";

  static buildFingerprint(item: Zotero.Item): string {
    const parts = [
      item.itemType || "",
      item.getField("proceedingsTitle") || "",
      item.getField("publicationTitle") || "",
      item.getField("conferenceName") || "",
      item.getField("title") || "",
    ];
    const normalized = parts
      .map((part) => String(part).trim().toLowerCase().replace(/\s+/g, " "))
      .join("\u001f");
    return this.hashString(normalized);
  }

  static readFromExtra(item: Zotero.Item): CCFCachedRecord | null {
    try {
      const extra = (item.getField("extra") as string) || "";
      const rankMatch = extra.match(/^CCF-Rank:\s*(.+)$/m);
      if (!rankMatch) return null;

      const categoryMatch = extra.match(/^CCF-Category:\s*(.+)$/m);
      const abbrMatch = extra.match(/^CCF-Abbr:\s*(.+)$/m);
      const versionMatch = extra.match(/^CCF-Version:\s*(.+)$/m);
      const fingerprintMatch = extra.match(/^CCF-Fingerprint:\s*(.+)$/m);
      const minScoreMatch = extra.match(/^CCF-MinScore:\s*(.+)$/m);
      const rulesHashMatch = extra.match(/^CCF-RulesHash:\s*(.+)$/m);
      const confidenceMatch = extra.match(/^CCF-Confidence:\s*(.+)$/m);
      const strategyMatch = extra.match(/^CCF-Strategy:\s*(.+)$/m);

      if (
        !versionMatch ||
        !fingerprintMatch ||
        !minScoreMatch ||
        !rulesHashMatch ||
        !confidenceMatch ||
        !strategyMatch
      ) {
        return null;
      }

      return {
        rank: rankMatch[1].trim() as CCFCachedRecord["rank"],
        category: categoryMatch ? categoryMatch[1].trim() : "",
        abbr: abbrMatch ? abbrMatch[1].trim() : "",
        version: versionMatch[1].trim(),
        fingerprint: fingerprintMatch[1].trim(),
        minScore: Number(minScoreMatch[1].trim()),
        rulesHash: rulesHashMatch[1].trim(),
        confidence: Number(confidenceMatch[1].trim()),
        strategy: strategyMatch[1].trim() as CCFCachedRecord["strategy"],
      };
    } catch {
      return null;
    }
  }

  static isValid(record: CCFCachedRecord | null, fingerprint: string) {
    if (!record) return false;
    const { minMatchScore } = getCCFSettings();
    return (
      record.version === CCF_DATA_VERSION &&
      record.fingerprint === fingerprint &&
      record.minScore === minMatchScore &&
      record.rulesHash === getCustomAliasRulesHash()
    );
  }

  static async writeToExtra(
    item: Zotero.Item,
    entry: CCFEntry,
    fingerprint: string,
    match: Pick<CCFComputedMatch, "confidence" | "strategy">,
  ): Promise<boolean> {
    try {
      const currentExtra = (item.getField("extra") as string) || "";
      const cleaned = this.removeCCFLines(currentExtra);
      const { minMatchScore } = getCCFSettings();
      const ccfLines = [
        `${this.RANK_KEY} ${entry.rank}`,
        `${this.CATEGORY_KEY} ${entry.category}`,
        `${this.ABBR_KEY} ${entry.abbr}`,
        `${this.VERSION_KEY} ${CCF_DATA_VERSION}`,
        `${this.FINGERPRINT_KEY} ${fingerprint}`,
        `${this.MIN_SCORE_KEY} ${minMatchScore}`,
        `${this.RULES_HASH_KEY} ${getCustomAliasRulesHash()}`,
        `${this.CONFIDENCE_KEY} ${match.confidence}`,
        `${this.STRATEGY_KEY} ${match.strategy}`,
      ].join("\n");
      const nextExtra = cleaned ? `${ccfLines}\n${cleaned}` : ccfLines;
      if (nextExtra === currentExtra) {
        return false;
      }
      item.setField("extra", nextExtra);
      await item.saveTx({
        notifierData: {
          [CCF_INTERNAL_NOTIFIER_KEY]: true,
        },
      });
      return true;
    } catch (e) {
      safeLog("[CCF Cache] Error writing to Extra:", e);
      return false;
    }
  }

  static async clearFromExtra(item: Zotero.Item): Promise<boolean> {
    try {
      const extra = (item.getField("extra") as string) || "";
      const cleaned = this.removeCCFLines(extra);
      if (cleaned === extra) {
        return false;
      }
      item.setField("extra", cleaned);
      await item.saveTx({
        notifierData: {
          [CCF_INTERNAL_NOTIFIER_KEY]: true,
        },
      });
      return true;
    } catch (e) {
      safeLog("[CCF Cache] Error clearing Extra:", e);
      return false;
    }
  }

  private static removeCCFLines(extra: string): string {
    return extra
      .split("\n")
      .filter(
        (line) =>
          !line.startsWith(this.RANK_KEY) &&
          !line.startsWith(this.CATEGORY_KEY) &&
          !line.startsWith(this.ABBR_KEY) &&
          !line.startsWith(this.VERSION_KEY) &&
          !line.startsWith(this.FINGERPRINT_KEY) &&
          !line.startsWith(this.MIN_SCORE_KEY) &&
          !line.startsWith(this.RULES_HASH_KEY) &&
          !line.startsWith(this.CONFIDENCE_KEY) &&
          !line.startsWith(this.STRATEGY_KEY),
      )
      .join("\n")
      .trim();
  }

  private static hashString(input: string) {
    let hash = 5381;
    for (let i = 0; i < input.length; i += 1) {
      hash = (hash * 33) ^ input.charCodeAt(i);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
}
