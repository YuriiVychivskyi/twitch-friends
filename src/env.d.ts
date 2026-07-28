interface ImportMetaEnv {
  readonly WXT_PUBLIC_BACKEND_URL?: string;
  readonly WXT_PUBLIC_FIREBASE_API_KEY?: string;
  readonly WXT_PUBLIC_FIREBASE_APP_ID?: string;
  readonly WXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
  readonly WXT_PUBLIC_FIREBASE_DATABASE_URL?: string;
  readonly WXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
  readonly WXT_PUBLIC_FIREBASE_USE_EMULATORS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
