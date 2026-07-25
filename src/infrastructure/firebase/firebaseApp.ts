import { getApp, getApps, initializeApp } from 'firebase/app';

import { getFirebaseEnvironment } from '@/config/firebaseEnvironment';

export function getFirebaseApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  const environment = getFirebaseEnvironment();

  return initializeApp({
    apiKey: environment.apiKey,
    appId: environment.appId,
    authDomain: environment.authDomain,
    databaseURL: environment.databaseUrl,
    projectId: environment.projectId,
  });
}
