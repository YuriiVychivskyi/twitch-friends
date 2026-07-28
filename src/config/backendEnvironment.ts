import { getFirebaseEnvironment } from '@/config/firebaseEnvironment';

export function getBackendUrl() {
  const value = import.meta.env.WXT_PUBLIC_BACKEND_URL?.trim();

  if (!value) {
    throw new Error('Backend URL is not configured.');
  }

  try {
    const url = new URL(value);
    const firebase = getFirebaseEnvironment();
    const local =
      firebase.useEmulators &&
      url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost'].includes(url.hostname);

    if (
      (!local && url.protocol !== 'https:') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== '/' && url.pathname !== '')
    ) {
      throw new Error('Invalid backend URL.');
    }

    return url.origin;
  } catch (cause) {
    throw new Error('Backend URL is invalid.', { cause });
  }
}
