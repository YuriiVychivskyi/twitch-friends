import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';

import { getFirebaseEnvironment } from '@/config/firebaseEnvironment';
import { ensureAnonymousAuth } from '@/infrastructure/firebase/firebaseAuth';
import { getFirebaseFunctions } from '@/infrastructure/firebase/firebaseFunctions';

type TwitchAuthorizationStart = {
  authorizationUrl: string;
};

function getOAuthCallbackUri() {
  const environment = getFirebaseEnvironment();

  if (environment.useEmulators) {
    return `http://localhost:5001/${environment.projectId}/europe-west1/twitchOAuthCallback`;
  }

  const callbackUri = import.meta.env.WXT_PUBLIC_TWITCH_OAUTH_CALLBACK_URL?.trim();

  if (!callbackUri) {
    throw new Error('Twitch OAuth callback URL is not configured.');
  }

  return callbackUri;
}

function isAuthorizationStart(value: unknown): value is TwitchAuthorizationStart {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const authorizationUrl = (value as Record<string, unknown>).authorizationUrl;

  if (typeof authorizationUrl !== 'string') {
    return false;
  }

  try {
    return new URL(authorizationUrl).origin === 'https://id.twitch.tv';
  } catch {
    return false;
  }
}

export async function authorizeWithTwitch() {
  await ensureAnonymousAuth();

  const startAuthorization = httpsCallable<{ callbackUri: string }, TwitchAuthorizationStart>(
    getFirebaseFunctions(),
    'startTwitchAuthorization',
  );

  try {
    const result = await startAuthorization({
      callbackUri: getOAuthCallbackUri(),
    });

    if (!isAuthorizationStart(result.data)) {
      throw new Error('Profile backend returned an invalid authorization URL.');
    }

    await browser.tabs.create({
      url: result.data.authorizationUrl,
    });
  } catch (cause) {
    if (cause instanceof FirebaseError && cause.code === 'functions/permission-denied') {
      throw new Error('Twitch OAuth callback URL is not allowed by the backend.', { cause });
    }

    if (cause instanceof FirebaseError && cause.code === 'functions/resource-exhausted') {
      throw new Error('Wait a few seconds before trying again.', { cause });
    }

    if (
      cause instanceof FirebaseError &&
      ['functions/internal', 'functions/unavailable'].includes(cause.code)
    ) {
      throw new Error('Profile backend is unavailable.', { cause });
    }

    throw cause;
  }
}
