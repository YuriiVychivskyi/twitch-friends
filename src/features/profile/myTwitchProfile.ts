import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';

import { isTwitchUserProfile, type TwitchUserProfile } from '@/features/friends/twitchUserProfile';
import { ensureAnonymousAuth } from '@/infrastructure/firebase/firebaseAuth';
import { getFirebaseFunctions } from '@/infrastructure/firebase/firebaseFunctions';

function profileError(cause: unknown) {
  if (!(cause instanceof FirebaseError)) {
    return cause;
  }

  if (['functions/internal', 'functions/unavailable'].includes(cause.code)) {
    return new Error('Profile backend is unavailable.', { cause });
  }

  return cause;
}

export async function getMyTwitchProfile() {
  await ensureAnonymousAuth();

  const getProfile = httpsCallable<undefined, TwitchUserProfile | null>(
    getFirebaseFunctions(),
    'getMyTwitchProfile',
  );

  try {
    const result = await getProfile();

    if (result.data === null) {
      return null;
    }

    if (!isTwitchUserProfile(result.data)) {
      throw new Error('Profile backend returned invalid data.');
    }

    return result.data;
  } catch (cause) {
    throw profileError(cause);
  }
}
