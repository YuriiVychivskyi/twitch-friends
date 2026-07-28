import {
  connectAuthEmulator,
  deleteUser,
  getAuth,
  indexedDBLocalPersistence,
  setPersistence,
  signOut,
  signInAnonymously,
} from 'firebase/auth/web-extension';

import { getFirebaseEnvironment } from '@/config/firebaseEnvironment';
import { getFirebaseApp } from '@/infrastructure/firebase/firebaseApp';

let authPromise: Promise<string> | null = null;
let emulatorConnected = false;

async function initializeAnonymousAuth() {
  const environment = getFirebaseEnvironment();
  const auth = getAuth(getFirebaseApp());

  if (environment.useEmulators && !emulatorConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
      disableWarnings: true,
    });
    emulatorConnected = true;
  }

  await setPersistence(auth, indexedDBLocalPersistence);
  await auth.authStateReady();

  if (auth.currentUser) {
    return auth.currentUser.uid;
  }

  const credential = await signInAnonymously(auth);

  return credential.user.uid;
}

export function ensureAnonymousAuth() {
  authPromise ??= initializeAnonymousAuth().catch((cause: unknown) => {
    authPromise = null;
    throw cause;
  });

  return authPromise;
}

export async function getFirebaseIdToken() {
  await ensureAnonymousAuth();

  const user = getAuth(getFirebaseApp()).currentUser;

  if (!user) {
    throw new Error('Firebase authentication is unavailable.');
  }

  return user.getIdToken();
}

export async function deleteFirebaseAccount() {
  const auth = getAuth(getFirebaseApp());

  await auth.authStateReady();

  if (auth.currentUser) {
    await deleteUser(auth.currentUser);
  }

  authPromise = null;
}

export async function clearFirebaseSession() {
  const auth = getAuth(getFirebaseApp());

  authPromise = null;
  await signOut(auth);
}
