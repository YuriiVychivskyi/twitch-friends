import { isTwitchUserProfile, type TwitchUserProfile } from '@/features/friends/twitchUserProfile';
import { isAccountSetupRequired } from '@/features/profile/accountState';
import { BackendError, requestBackend } from '@/infrastructure/backend/backendApi';

export const TWITCH_PROFILE_CONNECTED = 'twitch-profile:connected';

export function isTwitchProfileConnectedMessage(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as Record<string, unknown>;

  return Object.keys(message).length === 1 && message.type === TWITCH_PROFILE_CONNECTED;
}

function profileError(cause: unknown) {
  if (!(cause instanceof BackendError)) {
    return cause;
  }

  if (['internal', 'unavailable'].includes(cause.code)) {
    return new Error('Profile backend is unavailable.', { cause });
  }

  return cause;
}

export async function getMyTwitchProfile() {
  if (await isAccountSetupRequired()) {
    return null;
  }

  try {
    const profile = await requestBackend<TwitchUserProfile | null>('/api/profile');

    if (profile === null) {
      return null;
    }

    if (!isTwitchUserProfile(profile)) {
      throw new Error('Profile backend returned invalid data.');
    }

    return profile;
  } catch (cause) {
    throw profileError(cause);
  }
}
