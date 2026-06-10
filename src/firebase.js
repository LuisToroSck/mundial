import { initializeApp } from 'firebase/app';
import { collection, doc, getDocs, getFirestore, limit, query, writeBatch } from 'firebase/firestore';

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

export async function getCollectionDocuments(collectionName) {
  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.map((item) => item.data());
}

export function getGroupStandings() {
  return getCollectionDocuments('groupStandings');
}
