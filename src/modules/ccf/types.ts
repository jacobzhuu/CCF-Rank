export type CCFRank = "A" | "B" | "C";

export interface CCFEntry {
  abbr: string;
  fullName: string;
  rank: CCFRank;
  category: string;
}

export type EntryKind = "conference" | "journal";

export type CCFMatchStrategy =
  | "custom-alias"
  | "extracted-abbr"
  | "abbr-exact"
  | "leading-token"
  | "full-name-exact"
  | "fuzzy";

export type CCFMatchField =
  | "proceedingsTitle"
  | "publicationTitle"
  | "conferenceName"
  | "title";

export interface CCFCachedRecord {
  rank: CCFRank;
  category: string;
  abbr: string;
  fingerprint: string;
  version: string;
  minScore: number;
  rulesHash: string;
  confidence: number;
  strategy: CCFMatchStrategy;
}

export type CCFResolvedSource = "manual" | "extra" | "computed";

export interface CCFResolvedData {
  rank: CCFRank;
  category: string;
  abbr: string;
  fingerprint: string;
  version: string;
  source: CCFResolvedSource;
  confidence: number;
  strategy?: CCFMatchStrategy;
  matchedAlias?: string;
  matchedField?: CCFMatchField;
  matchedValue?: string;
}

export interface CCFComputedMatch {
  entry: CCFEntry;
  score: number;
  confidence: number;
  strategy: CCFMatchStrategy;
  matchedAlias?: string;
  matchedField?: CCFMatchField;
  matchedValue?: string;
}
