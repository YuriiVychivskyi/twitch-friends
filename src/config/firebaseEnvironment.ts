export type FirebaseEnvironment = {
  apiKey: string;
  appId: string;
  authDomain: string;
  databaseUrl: string;
  projectId: string;
  useEmulators: boolean;
};

function requireEnvironmentValue(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function getFirebaseEnvironment(): FirebaseEnvironment {
  return {
    apiKey: requireEnvironmentValue(
      'WXT_PUBLIC_FIREBASE_API_KEY',
      import.meta.env.WXT_PUBLIC_FIREBASE_API_KEY,
    ),
    appId: requireEnvironmentValue(
      'WXT_PUBLIC_FIREBASE_APP_ID',
      import.meta.env.WXT_PUBLIC_FIREBASE_APP_ID,
    ),
    authDomain: requireEnvironmentValue(
      'WXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
      import.meta.env.WXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    ),
    databaseUrl: requireEnvironmentValue(
      'WXT_PUBLIC_FIREBASE_DATABASE_URL',
      import.meta.env.WXT_PUBLIC_FIREBASE_DATABASE_URL,
    ),
    projectId: requireEnvironmentValue(
      'WXT_PUBLIC_FIREBASE_PROJECT_ID',
      import.meta.env.WXT_PUBLIC_FIREBASE_PROJECT_ID,
    ),
    useEmulators: import.meta.env.WXT_PUBLIC_FIREBASE_USE_EMULATORS === 'true',
  };
}
