import { describe, expect, it } from 'vitest';

import {
  isPresenceFriendsRefreshMessage,
  PRESENCE_FRIENDS_REFRESH,
} from '@/features/presence/presenceMessages';

describe('presence refresh messages', () => {
  it('accepts the exact refresh message', () => {
    expect(isPresenceFriendsRefreshMessage({ type: PRESENCE_FRIENDS_REFRESH })).toBe(true);
  });

  it('rejects malformed refresh messages', () => {
    expect(isPresenceFriendsRefreshMessage(null)).toBe(false);
    expect(isPresenceFriendsRefreshMessage({ type: PRESENCE_FRIENDS_REFRESH, value: true })).toBe(
      false,
    );
    expect(isPresenceFriendsRefreshMessage({ type: 'presence-friends:other' })).toBe(false);
  });
});
