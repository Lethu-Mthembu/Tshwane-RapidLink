import type { IncidentDraft } from './types';

const DB_NAME = 'rapidlink-media-v1';
const STORE = 'drafts';

const database = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export async function loadDraft(incidentId: string): Promise<IncidentDraft | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(incidentId);
    request.onsuccess = () => resolve((request.result as IncidentDraft | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDraft(incidentId: string, draft: IncidentDraft) {
  if (typeof indexedDB === 'undefined') return;
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(draft, incidentId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteDraft(incidentId: string) {
  if (typeof indexedDB === 'undefined') return;
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(incidentId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
