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
  addLocalFriend,
  getLocalFriends,
  parseLocalFriends,
  removeLocalFriend,
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
          { addedAt: 10, login: 'First_Friend' },
          { addedAt: 20, login: 'first_friend' },
          { addedAt: -1, login: 'invalid_time' },
          { addedAt: 30, login: 'directory' },
        ],
        version: 1,
      }),
    ).toEqual([
      {
        addedAt: 10,
        avatarUrl: '',
        displayName: 'first_friend',
        login: 'first_friend',
        twitchId: '',
      },
    ]);
  });

  it('returns an empty list for unsupported storage data', () => {
    expect(parseLocalFriends(undefined)).toEqual([]);
    expect(parseLocalFriends({ items: [], version: 3 })).toEqual([]);
  });

  it('adds a normalized Twitch login', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    storage.get.mockResolvedValue({ friends: { items: [], version: 1 } });
    storage.set.mockResolvedValue(undefined);

    await expect(addLocalFriend(twitchProfile('new_friend'))).resolves.toEqual({
      addedAt: 100,
      avatarUrl: 'https://static-cdn.jtvnw.net/new_friend.png',
      displayName: 'new_friend',
      login: 'new_friend',
      twitchId: 'new_friend-id',
    });
    expect(storage.set).toHaveBeenCalledWith({
      friends: {
        items: [
          {
            addedAt: 100,
            avatarUrl: 'https://static-cdn.jtvnw.net/new_friend.png',
            displayName: 'new_friend',
            login: 'new_friend',
            twitchId: 'new_friend-id',
          },
        ],
        version: 2,
      },
    });
  });

  it('updates Twitch data for an existing friend', async () => {
    storage.get.mockResolvedValue({
      friends: {
        items: [{ addedAt: 50, login: 'existing_friend' }],
        version: 1,
      },
    });

    await expect(addLocalFriend(twitchProfile('existing_friend'))).resolves.toEqual({
      addedAt: 50,
      avatarUrl: 'https://static-cdn.jtvnw.net/existing_friend.png',
      displayName: 'existing_friend',
      login: 'existing_friend',
      twitchId: 'existing_friend-id',
    });
    expect(storage.set).toHaveBeenCalledWith({
      friends: {
        items: [
          {
            addedAt: 50,
            avatarUrl: 'https://static-cdn.jtvnw.net/existing_friend.png',
            displayName: 'existing_friend',
            login: 'existing_friend',
            twitchId: 'existing_friend-id',
          },
        ],
        version: 2,
      },
    });
  });

  it('removes a saved friend', async () => {
    storage.get.mockResolvedValue({
      friends: {
        items: [
          { addedAt: 50, login: 'first_friend' },
          { addedAt: 60, login: 'second_friend' },
        ],
        version: 1,
      },
    });
    storage.set.mockResolvedValue(undefined);

    await expect(removeLocalFriend('first_friend')).resolves.toBe(true);
    expect(storage.set).toHaveBeenCalledWith({
      friends: {
        items: [
          {
            addedAt: 60,
            avatarUrl: '',
            displayName: 'second_friend',
            login: 'second_friend',
            twitchId: '',
          },
        ],
        version: 2,
      },
    });
  });

  it('reads friends from extension storage', async () => {
    storage.get.mockResolvedValue({
      friends: {
        items: [{ addedAt: 50, login: 'saved_friend' }],
        version: 1,
      },
    });

    await expect(getLocalFriends()).resolves.toEqual([
      {
        addedAt: 50,
        avatarUrl: '',
        displayName: 'saved_friend',
        login: 'saved_friend',
        twitchId: '',
      },
    ]);
  });
});
