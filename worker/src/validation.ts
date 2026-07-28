import { ApiError } from './errors';
import type { PublicIdentityKey, TwitchUser } from './types';

export function normalizeLogin(value: unknown) {
  const login = typeof value === 'string' ? value.trim().toLowerCase() : '';

  if (!/^[a-z0-9_]{1,25}$/u.test(login)) {
    throw new ApiError(400, 'invalid-argument', 'Enter a valid Twitch login.');
  }

  return login;
}

export function validateConnectionId(value: unknown) {
  const connectionId = typeof value === 'string' ? value.trim() : '';

  if (!/^[a-z0-9_-]{1,128}$/iu.test(connectionId)) {
    throw new ApiError(400, 'invalid-argument', 'Invalid friend connection.');
  }

  return connectionId;
}

export function validatePublicIdentityKey(value: unknown): PublicIdentityKey {
  if (!value || typeof value !== 'object') {
    throw new ApiError(400, 'invalid-argument', 'Public identity key is required.');
  }

  const key = value as Record<string, unknown>;

  if (
    key.crv !== 'P-256' ||
    key.kty !== 'EC' ||
    typeof key.x !== 'string' ||
    typeof key.y !== 'string' ||
    !/^[a-z0-9_-]{43}$/iu.test(key.x) ||
    !/^[a-z0-9_-]{43}$/iu.test(key.y)
  ) {
    throw new ApiError(400, 'invalid-argument', 'Public identity key is invalid.');
  }

  return {
    crv: key.crv,
    kty: key.kty,
    x: key.x,
    y: key.y,
  };
}

export function isTwitchUser(value: unknown): value is TwitchUser {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const user = value as Record<string, unknown>;

  if (
    typeof user.avatarUrl !== 'string' ||
    typeof user.displayName !== 'string' ||
    typeof user.id !== 'string' ||
    typeof user.login !== 'string' ||
    user.displayName.length < 1 ||
    user.displayName.length > 25 ||
    !/^\d{1,32}$/u.test(user.id) ||
    !/^[a-z0-9_]{1,25}$/u.test(user.login)
  ) {
    return false;
  }

  if (user.avatarUrl.length === 0) {
    return true;
  }

  try {
    const url = new URL(user.avatarUrl);

    return user.avatarUrl.length <= 2_048 && url.protocol === 'https:';
  } catch {
    return false;
  }
}
