export type TwitchUserProfile = {
  avatarUrl: string;
  displayName: string;
  id: string;
  login: string;
};

function isProfileImageUrl(value: string) {
  if (value.length === 0) {
    return true;
  }

  try {
    const url = new URL(value);

    return value.length <= 2_048 && url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isTwitchUserProfile(value: unknown): value is TwitchUserProfile {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const user = value as Record<string, unknown>;

  return (
    Object.keys(user).length === 4 &&
    typeof user.avatarUrl === 'string' &&
    isProfileImageUrl(user.avatarUrl) &&
    typeof user.displayName === 'string' &&
    user.displayName.length >= 1 &&
    user.displayName.length <= 25 &&
    typeof user.id === 'string' &&
    /^\d{1,32}$/u.test(user.id) &&
    typeof user.login === 'string' &&
    /^[a-z0-9_]{1,25}$/u.test(user.login)
  );
}
