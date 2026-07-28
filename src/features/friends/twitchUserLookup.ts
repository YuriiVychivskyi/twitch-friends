import { FirebaseError } from 'firebase/app';
import { httpsCallable, type HttpsCallableResult } from 'firebase/functions';

import { ensureAnonymousAuth } from '@/infrastructure/firebase/firebaseAuth';
import { getFirebaseFunctions } from '@/infrastructure/firebase/firebaseFunctions';

export type TwitchUserProfile = {
  avatarUrl: string;
  displayName: string;
  id: string;
  login: string;
};

export function isTwitchUserProfile(value: unknown): value is TwitchUserProfile {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const user = value as Record<string, unknown>;

  return (
    Object.keys(user).length === 4 &&
    typeof user.avatarUrl === 'string' &&
    typeof user.displayName === 'string' &&
    typeof user.id === 'string' &&
    typeof user.login === 'string'
  );
}

export async function lookupTwitchUser(login: string) {
  await ensureAnonymousAuth();

  const lookup = httpsCallable<{ login: string }, TwitchUserProfile | null>(
    getFirebaseFunctions(),
    'lookupTwitchUser',
  );
  let result: HttpsCallableResult<TwitchUserProfile | null>;

  try {
    result = await lookup({ login });
  } catch (cause) {
    if (cause instanceof FirebaseError && cause.code === 'functions/resource-exhausted') {
      throw new Error('Too many Twitch lookups. Try again in a minute.', { cause });
    }

    if (
      cause instanceof FirebaseError &&
      ['functions/internal', 'functions/unavailable'].includes(cause.code)
    ) {
      throw new Error('Twitch lookup backend is unavailable.', { cause });
    }

    throw cause;
  }

  if (result.data === null) {
    return null;
  }

  if (!isTwitchUserProfile(result.data)) {
    throw new Error('Twitch returned invalid user data.');
  }

  return result.data;
}
