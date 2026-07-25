import type { LocalIdentity } from '@/security/identity/localIdentityTypes';

const DATABASE_NAME = 'twitch-friends';
const DATABASE_VERSION = 1;
const IDENTITY_KEY = 'primary';
const IDENTITY_STORE = 'identity';

function databaseError(error: DOMException | null, fallback: string) {
  return error ?? new Error(fallback);
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(IDENTITY_STORE)) {
        database.createObjectStore(IDENTITY_STORE);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(databaseError(request.error, 'Unable to open identity database.'));
    };
  });
}

export async function readLocalIdentity() {
  const database = await openDatabase();

  try {
    return await new Promise<LocalIdentity | null>((resolve, reject) => {
      const transaction = database.transaction(IDENTITY_STORE, 'readonly');
      const request = transaction.objectStore(IDENTITY_STORE).get(IDENTITY_KEY);

      request.onsuccess = () => {
        resolve((request.result as LocalIdentity | undefined) ?? null);
      };

      request.onerror = () => {
        reject(databaseError(request.error, 'Unable to read local identity.'));
      };
    });
  } finally {
    database.close();
  }
}

export async function writeLocalIdentity(identity: LocalIdentity) {
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(IDENTITY_STORE, 'readwrite');

      transaction.objectStore(IDENTITY_STORE).put(identity, IDENTITY_KEY);

      transaction.oncomplete = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(databaseError(transaction.error, 'Unable to write local identity.'));
      };

      transaction.onabort = () => {
        reject(databaseError(transaction.error, 'Local identity transaction was aborted.'));
      };
    });
  } finally {
    database.close();
  }
}
