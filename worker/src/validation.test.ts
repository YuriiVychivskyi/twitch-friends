import { describe, expect, it } from 'vitest';

import {
  isTwitchUser,
  normalizeLogin,
  validateConnectionId,
  validatePublicIdentityKey,
} from './validation';

describe('Worker input validation', () => {
  it('normalizes Twitch logins', () => {
    expect(normalizeLogin('  LIVAY1337 ')).toBe('livay1337');
    expect(() => normalizeLogin('../invalid')).toThrow('Enter a valid Twitch login.');
  });

  it('validates connection identifiers', () => {
    expect(validateConnectionId('firebase_user-1')).toBe('firebase_user-1');
    expect(() => validateConnectionId('user/path')).toThrow('Invalid friend connection.');
  });

  it('accepts only P-256 public identity keys', () => {
    const key = {
      crv: 'P-256',
      kty: 'EC',
      x: 'a'.repeat(43),
      y: 'b'.repeat(43),
    };

    expect(validatePublicIdentityKey(key)).toEqual(key);
    expect(() => validatePublicIdentityKey({ ...key, crv: 'P-384' })).toThrow(
      'Public identity key is invalid.',
    );
  });

  it('validates Twitch profiles', () => {
    expect(
      isTwitchUser({
        avatarUrl: 'https://static-cdn.jtvnw.net/avatar.png',
        displayName: 'LIVAY1337',
        id: '123456',
        login: 'livay1337',
      }),
    ).toBe(true);
    expect(
      isTwitchUser({
        avatarUrl: 'javascript:alert(1)',
        displayName: 'LIVAY1337',
        id: '123456',
        login: 'livay1337',
      }),
    ).toBe(false);
  });
});
