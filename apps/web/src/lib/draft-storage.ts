export interface DocumentDraft {
  documentId: string;
  projectId: string;
  content: string;
  baseRevision: number;
  baseHash: string;
  updatedAt: string;
}

const DB_NAME = 'texly_editor_db';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

let dbPromise: Promise<IDBDatabase> | null = null;

function isIndexedDbSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

export function openDraftDb(): Promise<IDBDatabase> {
  if (!isIndexedDbSupported()) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'documentId' });
        store.createIndex('by_project', 'projectId', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Failed to open drafts IndexedDB'));
    };
  });

  return dbPromise;
}

export async function saveDraft(draft: DocumentDraft): Promise<void> {
  if (!isIndexedDbSupported()) return;

  try {
    const db = await openDraftDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(draft);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to save draft to IndexedDB:', err);
  }
}

export async function getDraft(documentId: string): Promise<DocumentDraft | null> {
  if (!isIndexedDbSupported() || !documentId) return null;

  try {
    const db = await openDraftDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(documentId);

      req.onsuccess = () => {
        resolve((req.result as DocumentDraft) || null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`Failed to get draft for ${documentId} from IndexedDB:`, err);
    return null;
  }
}

export async function deleteDraft(documentId: string): Promise<void> {
  if (!isIndexedDbSupported() || !documentId) return;

  try {
    const db = await openDraftDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(documentId);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`Failed to delete draft for ${documentId} from IndexedDB:`, err);
  }
}

export async function listDraftsForProject(projectId: string): Promise<DocumentDraft[]> {
  if (!isIndexedDbSupported() || !projectId) return [];

  try {
    const db = await openDraftDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('by_project');
      const req = index.getAll(projectId);

      req.onsuccess = () => {
        resolve((req.result as DocumentDraft[]) || []);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`Failed to list drafts for project ${projectId} from IndexedDB:`, err);
    return [];
  }
}

export async function clearAllDrafts(): Promise<void> {
  if (!isIndexedDbSupported()) return;

  try {
    const db = await openDraftDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to clear drafts from IndexedDB:', err);
  }
}
