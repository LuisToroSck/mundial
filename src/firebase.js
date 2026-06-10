import { initializeApp } from 'firebase/app';
import { collection, doc, getDoc, getDocs, getFirestore, limit, query, setDoc, writeBatch } from 'firebase/firestore';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB4-BUKnCY0fJlzdN2HlmYwvCaSFCv-L78",
  authDomain: "mundial-1805a.firebaseapp.com",
  databaseURL: "https://mundial-1805a-default-rtdb.firebaseio.com",
  projectId: "mundial-1805a",
  storageBucket: "mundial-1805a.firebasestorage.app",
  messagingSenderId: "314455928168",
  appId: "1:314455928168:web:fdc5cd7f188c49390c7add",
  measurementId: "G-B1W6ERSZ8V"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export async function seedCollectionIfEmpty(collectionName, items, getDocumentId) {
  const collectionRef = collection(db, collectionName);
  const existingDocs = await getDocs(query(collectionRef, limit(1)));

  if (!existingDocs.empty) {
    return {
      inserted: 0,
      skipped: true
    };
  }

  const batch = writeBatch(db);

  for (const item of items) {
    const documentId = getDocumentId(item);
    batch.set(doc(db, collectionName, documentId), item);
  }

  await batch.commit();

  return {
    inserted: items.length,
    skipped: false
  };
}

export function seedGroupStandingsIfEmpty(items) {
  return seedCollectionIfEmpty('groupStandings', items, (item) => `${item.group}-${item.flag}`);
}

export function seedTeamResultsIfEmpty(items) {
  return seedCollectionIfEmpty('teamResults', items, (item) => item.flag);
}

export async function seedDocumentIfMissing(collectionName, documentId, data) {
  const documentRef = doc(db, collectionName, documentId);
  const snapshot = await getDoc(documentRef);

  if (snapshot.exists()) {
    return {
      inserted: false,
      skipped: true
    };
  }

  await setDoc(documentRef, data);

  return {
    inserted: true,
    skipped: false
  };
}

export function seedScoringRulesIfMissing(data) {
  return seedDocumentIfMissing('appConfig', 'scoringRules', data);
}

export async function getCollectionDocuments(collectionName) {
  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map((item) => item.data());
}

export async function getDocumentData(collectionName, documentId) {
  const snapshot = await getDoc(doc(db, collectionName, documentId));
  return snapshot.exists() ? snapshot.data() : null;
}

export function getGroupStandings() {
  return getCollectionDocuments('groupStandings');
}

export function getTeamResults() {
  return getCollectionDocuments('teamResults');
}

export function getScoringRules() {
  return getDocumentData('appConfig', 'scoringRules');
}

export async function saveDocument(collectionName, documentId, data) {
  await setDoc(doc(db, collectionName, documentId), data);
}

export function saveGroupStanding(data) {
  return saveDocument('groupStandings', `${data.group}-${data.flag}`, data);
}

export function saveTeamResult(data) {
  return saveDocument('teamResults', data.flag, data);
}

export async function replaceCollectionDocuments(collectionName, items, getDocumentId) {
  const collectionRef = collection(db, collectionName);
  const snapshot = await getDocs(collectionRef);
  const batch = writeBatch(db);
  const nextDocumentIds = new Set(items.map((item) => getDocumentId(item)));

  let deleted = 0;

  snapshot.docs.forEach((documentSnapshot) => {
    if (!nextDocumentIds.has(documentSnapshot.id)) {
      batch.delete(documentSnapshot.ref);
      deleted += 1;
    }
  });

  items.forEach((item) => {
    const documentId = getDocumentId(item);
    batch.set(doc(db, collectionName, documentId), item);
  });

  await batch.commit();

  return {
    upserted: items.length,
    deleted
  };
}

export function replaceGroupStandings(items) {
  return replaceCollectionDocuments('groupStandings', items, (item) => `${item.group}-${item.flag}`);
}
