import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: storage,
    },
  },
}));

import {
  getLocalFriends,
  parseLocalFriends,
  replaceLocalFriends,
} from '@/features/friends/localFriends';

function twitchProfile(login: string) {
  return {
    avatarUrl: `https://static-cdn.jtvnw.net/${login}.png`,
    displayName: login,
    id: `${login}-id`,
    login,
  };
}

describe('local friends', () => {
  beforeEach(() => {
    storage.get.mockReset();
    storage.set.mockReset();
  });

  it('keeps only valid and unique friend records', () => {
    expect(
      parseLocalFriends({
        items: [
          { login: 'First_Friend' },
          { login: 'first_friend' },
          { login: 'directory' },
          { login: '' },
        ],
        version: 1,
      }),
    ).toEqual([
      {
        avatarUrl: '',
        displayName: 'first_friend',
        login: 'first_friend',
      },
    ]);
  });

  it('returns an empty list for unsupported storage data', () => {
    expect(parseLocalFriends(undefined)).toEqual([]);
    expect(parseLocalFriends({ items: [], version: 4 })).toEqual([]);
  });

  it('replaces local friends with accepted connections', async () => {
    storage.set.mockResolvedValue(undefined);

    await expect(
      replaceLocalFriends([twitchProfile('existing_friend'), twitchProfile('accepted_friend')]),
    ).resolves.toEqual([
      {
        avatarUrl: 'https://static-cdn.jtvnw.net/existing_friend.png',
        displayName: 'existing_friend',
        login: 'existing_friend',
      },
      {
        avatarUrl: 'https://static-cdn.jtvnw.net/accepted_friend.png',
        displayName: 'accepted_friend',
        login: 'accepted_friend',
      },
    ]);
    expect(storage.set).toHaveBeenCalledWith({
      friends: {
        items: [
          {
            avatarUrl: 'https://static-cdn.jtvnw.net/existing_friend.png',
            displayName: 'existing_friend',
            login: 'existing_friend',
          },
          {
            avatarUrl: 'https://static-cdn.jtvnw.net/accepted_friend.png',
            displayName: 'accepted_friend',
            login: 'accepted_friend',
          },
        ],
        version: 3,
      },
    });
  });

  it('reads friends from extension storage', async () => {
    storage.get.mockResolvedValue({
      friends: {
        items: [{ login: 'saved_friend' }],
        version: 2,
      },
    });

    await expect(getLocalFriends()).resolves.toEqual([
      {
        avatarUrl: '',
        displayName: 'saved_friend',
        login: 'saved_friend',
      },
    ]);
  });
});
