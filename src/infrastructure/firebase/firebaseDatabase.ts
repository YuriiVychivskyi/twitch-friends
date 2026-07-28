import { connectDatabaseEmulator, getDatabase } from 'firebase/database';

import { getFirebaseEnvironment } from '@/config/firebaseEnvironment';
import { getFirebaseApp } from '@/infrastructure/firebase/firebaseApp';

let emulatorConnected = false;

export function getFirebaseDatabase() {
  const database = getDatabase(getFirebaseApp());

  if (getFirebaseEnvironment().useEmulators && !emulatorConnected) {
    connectDatabaseEmulator(database, '127.0.0.1', 9000);
    emulatorConnected = true;
  }

  return database;
}
