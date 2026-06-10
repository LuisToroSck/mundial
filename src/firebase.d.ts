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

export function getCollectionDocuments<T>(collectionName: string): Promise<T[]>;

export function getGroupStandings<T>(): Promise<T[]>;
