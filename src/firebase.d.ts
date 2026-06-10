import type { Firestore } from 'firebase/firestore';

export const db: Firestore;

export function seedCollectionIfEmpty<T>(
  collectionName: string,
  items: T[],
  getDocumentId: (item: T) => string
): Promise<{
  inserted: number;
  skipped: boolean;
}>;

export function seedGroupStandingsIfEmpty<T extends { group: string; flag: string }>(
  items: T[]
): Promise<{
  inserted: number;
  skipped: boolean;
}>;

export function seedTeamResultsIfEmpty<T extends { flag: string }>(
  items: T[]
): Promise<{
  inserted: number;
  skipped: boolean;
}>;

export function seedDocumentIfMissing<T>(
  collectionName: string,
  documentId: string,
  data: T
): Promise<{
  inserted: boolean;
  skipped: boolean;
}>;

export function seedScoringRulesIfMissing<T>(data: T): Promise<{
  inserted: boolean;
  skipped: boolean;
}>;

export function getCollectionDocuments<T>(collectionName: string): Promise<T[]>;

export function getDocumentData<T>(collectionName: string, documentId: string): Promise<T | null>;

export function getGroupStandings<T>(): Promise<T[]>;

export function getTeamResults<T>(): Promise<T[]>;

export function getScoringRules<T>(): Promise<T | null>;

export function saveDocument<T>(collectionName: string, documentId: string, data: T): Promise<void>;

export function saveGroupStanding<T extends { group: string; flag: string }>(data: T): Promise<void>;

export function saveTeamResult<T extends { flag: string }>(data: T): Promise<void>;

export function replaceCollectionDocuments<T>(
  collectionName: string,
  items: T[],
  getDocumentId: (item: T) => string
): Promise<{
  upserted: number;
  deleted: number;
}>;

export function replaceGroupStandings<T extends { group: string; flag: string }>(
  items: T[]
): Promise<{
  upserted: number;
  deleted: number;
}>;
