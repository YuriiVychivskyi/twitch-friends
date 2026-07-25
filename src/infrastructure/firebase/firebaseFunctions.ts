import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

import { getFirebaseEnvironment } from '@/config/firebaseEnvironment';
import { getFirebaseApp } from '@/infrastructure/firebase/firebaseApp';

let emulatorConnected = false;

export function getFirebaseFunctions() {
  const functions = getFunctions(getFirebaseApp(), 'europe-west1');

  if (getFirebaseEnvironment().useEmulators && !emulatorConnected) {
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    emulatorConnected = true;
  }

  return functions;
}
