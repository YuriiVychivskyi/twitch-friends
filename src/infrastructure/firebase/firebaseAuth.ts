import {
  connectAuthEmulator,
  getAuth,
  indexedDBLocalPersistence,
  setPersistence,
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
