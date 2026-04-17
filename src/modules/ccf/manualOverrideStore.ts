import { config } from "../../../package.json";
import { safeLog } from "./logging";
import type { CCFRank } from "./types";

export class ManualCCFRankStore {
  private storageKey = `${config.prefsPrefix}.manualRanks`;
  private ignoreKey = `${config.prefsPrefix}.ignoreItems`;
  private legacyStorageKey = "extensions.ccfRank.manualRanks";
  private legacyIgnoreKey = "extensions.ccfRank.ignoreItems";
  private cache = new Map<number, CCFRank>();
  private ignoreSet = new Set<number>();

  constructor() {
    this.loadFromStorage();
  }

  getRank(itemID: number): CCFRank | null {
    return this.cache.get(itemID) || null;
  }

  hasManualRank(itemID: number) {
    return this.cache.has(itemID);
  }

  isIgnored(itemID: number) {
    return this.ignoreSet.has(itemID);
  }

  setRank(itemID: number, rank: CCFRank) {
    this.setRanks([itemID], rank);
  }

  setRanks(itemIDs: number[], rank: CCFRank) {
    itemIDs.forEach((itemID) => {
      this.cache.set(itemID, rank);
      this.ignoreSet.delete(itemID);
    });
    this.saveToStorage();
    safeLog(`[CCF Manual] Set rank ${rank} for ${itemIDs.length} items`);
  }

  clearRank(itemID: number) {
    this.clearRanks([itemID]);
  }

  clearRanks(itemIDs: number[]) {
    itemIDs.forEach((itemID) => {
      this.cache.delete(itemID);
      this.ignoreSet.delete(itemID);
    });
    this.saveToStorage();
    safeLog(`[CCF Manual] Cleared manual rank for ${itemIDs.length} items`);
  }

  ignoreItem(itemID: number) {
    this.ignoreItems([itemID]);
  }

  ignoreItems(itemIDs: number[]) {
    itemIDs.forEach((itemID) => {
      this.ignoreSet.add(itemID);
      this.cache.delete(itemID);
    });
    this.saveToStorage();
    safeLog(`[CCF Manual] Ignored ${itemIDs.length} items`);
  }

  private loadFromStorage() {
    try {
      const stored =
        this.readStringPref(this.storageKey) ||
        this.readStringPref(this.legacyStorageKey);
      if (stored) {
        const data = JSON.parse(stored) as Record<string, CCFRank>;
        this.cache = new Map(
          Object.entries(data).map(([key, value]) => [
            Number.parseInt(key, 10),
            value,
          ]),
        );
      }

      const ignored =
        this.readStringPref(this.ignoreKey) ||
        this.readStringPref(this.legacyIgnoreKey);
      if (ignored) {
        this.ignoreSet = new Set(JSON.parse(ignored) as number[]);
      }

      safeLog(
        `[CCF Manual] Loaded ${this.cache.size} manual ranks and ${this.ignoreSet.size} ignored items`,
      );
    } catch (e) {
      safeLog("[CCF Manual] Error loading from storage:", e);
    }
  }

  private saveToStorage() {
    try {
      const cacheObject: Record<number, CCFRank> = {};
      this.cache.forEach((value, key) => {
        cacheObject[key] = value;
      });
      Zotero.Prefs.set(this.storageKey, JSON.stringify(cacheObject), true);
      Zotero.Prefs.set(
        this.ignoreKey,
        JSON.stringify(Array.from(this.ignoreSet)),
        true,
      );
    } catch (e) {
      safeLog("[CCF Manual] Error saving to storage:", e);
    }
  }

  private readStringPref(key: string) {
    const value = Zotero.Prefs.get(key, true) as string | undefined;
    return value || "";
  }
}
