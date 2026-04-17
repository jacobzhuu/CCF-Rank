import { CCFCacheService } from "./cache";
import { CCF_DATA_VERSION, CCFRankMatcher } from "./matcher";
import { ManualCCFRankStore } from "./manualOverrideStore";
import { getCCFSettings } from "./settings";
import type { CCFEntry, CCFResolvedData } from "./types";

interface BaseResolvedData extends Omit<CCFResolvedData, "source"> {
  source: "extra" | "computed";
  entry: CCFEntry;
}

interface SessionCacheEntry {
  fingerprint: string;
  value: BaseResolvedData | null;
}

export class CCFRankResolver {
  private sessionCache = new Map<number, SessionCacheEntry>();

  constructor(
    private matcher: CCFRankMatcher,
    private manualStore: ManualCCFRankStore,
  ) {}

  resolveItem(
    item: Zotero.Item,
    options: { forceRefresh?: boolean; preferExtra?: boolean } = {},
  ): CCFResolvedData | null {
    if (!item || !item.isRegularItem()) return null;
    if (this.manualStore.isIgnored(item.id)) return null;

    const base = this.resolveBaseItem(item, options);
    const manualRank = this.manualStore.getRank(item.id);

    if (!manualRank) {
      return base;
    }

    if (!base) {
      return {
        rank: manualRank,
        category: "",
        abbr: "",
        fingerprint: CCFCacheService.buildFingerprint(item),
        version: CCF_DATA_VERSION,
        source: "manual",
        confidence: 100,
      };
    }

    return {
      ...base,
      rank: manualRank,
      source: "manual",
      confidence: 100,
    };
  }

  invalidateItems(ids: number[]) {
    ids.forEach((id) => this.sessionCache.delete(id));
  }

  clearSessionCache() {
    this.sessionCache.clear();
  }

  async refreshItems(
    items: Zotero.Item[],
    options: { persistExtra?: boolean } = {},
  ) {
    const { writeCacheToExtra } = getCCFSettings();
    const shouldPersist = options.persistExtra ?? writeCacheToExtra;
    let changed = 0;

    for (const item of items) {
      if (!item?.isRegularItem()) continue;

      this.sessionCache.delete(item.id);

      if (
        this.manualStore.isIgnored(item.id) ||
        this.manualStore.hasManualRank(item.id)
      ) {
        if (shouldPersist) {
          changed += (await CCFCacheService.clearFromExtra(item)) ? 1 : 0;
        }
        continue;
      }

      const base = this.resolveBaseItem(item, {
        forceRefresh: true,
        preferExtra: false,
      });

      if (!shouldPersist) {
        continue;
      }

      if (base) {
        changed += (await CCFCacheService.writeToExtra(
          item,
          base.entry,
          base.fingerprint,
          {
            confidence: base.confidence,
            strategy: base.strategy || "fuzzy",
          },
        ))
          ? 1
          : 0;
      } else {
        changed += (await CCFCacheService.clearFromExtra(item)) ? 1 : 0;
      }
    }

    return changed;
  }

  private resolveBaseItem(
    item: Zotero.Item,
    options: { forceRefresh?: boolean; preferExtra?: boolean } = {},
  ): BaseResolvedData | null {
    const fingerprint = CCFCacheService.buildFingerprint(item);
    const session = this.sessionCache.get(item.id);

    if (!options.forceRefresh && session?.fingerprint === fingerprint) {
      return session.value;
    }

    const useExtra =
      options.preferExtra !== false && getCCFSettings().writeCacheToExtra;
    if (useExtra) {
      const cached = CCFCacheService.readFromExtra(item);
      if (cached && CCFCacheService.isValid(cached, fingerprint)) {
        const value: BaseResolvedData = {
          rank: cached.rank,
          category: cached.category,
          abbr: cached.abbr,
          fingerprint,
          version: cached.version,
          source: "extra",
          confidence: cached.confidence,
          strategy: cached.strategy,
          entry: {
            abbr: cached.abbr,
            category: cached.category,
            fullName: "",
            rank: cached.rank,
          },
        };
        this.sessionCache.set(item.id, { fingerprint, value });
        return value;
      }
    }

    const match = this.matcher.getMatchFromItem(item);
    const value = match
      ? {
          rank: match.entry.rank,
          category: match.entry.category,
          abbr: match.entry.abbr,
          fingerprint,
          version: CCF_DATA_VERSION,
          source: "computed" as const,
          confidence: match.confidence,
          strategy: match.strategy,
          matchedAlias: match.matchedAlias,
          matchedField: match.matchedField,
          matchedValue: match.matchedValue,
          entry: match.entry,
        }
      : null;
    this.sessionCache.set(item.id, { fingerprint, value });
    return value;
  }
}
