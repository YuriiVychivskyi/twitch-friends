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
    ).toEqual([{ addedAt: 10, login: 'first_friend' }]);
  });

  it('returns an empty list for unsupported storage data', () => {
    expect(parseLocalFriends(undefined)).toEqual([]);
    expect(parseLocalFriends({ items: [], version: 2 })).toEqual([]);
  });

  it('adds a normalized Twitch login', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    storage.get.mockResolvedValue({ friends: { items: [], version: 1 } });
    storage.set.mockResolvedValue(undefined);

    await expect(addLocalFriend(' New_Friend ')).resolves.toEqual({
      addedAt: 100,
      login: 'new_friend',
    });
    expect(storage.set).toHaveBeenCalledWith({
      friends: {
        items: [{ addedAt: 100, login: 'new_friend' }],
        version: 1,
      },
    });
  });

  it('does not write an existing friend again', async () => {
    storage.get.mockResolvedValue({
      friends: {
        items: [{ addedAt: 50, login: 'existing_friend' }],
        version: 1,
      },
    });

    await expect(addLocalFriend('Existing_Friend')).resolves.toEqual({
      addedAt: 50,
      login: 'existing_friend',
    });
    expect(storage.set).not.toHaveBeenCalled();
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
        items: [{ addedAt: 60, login: 'second_friend' }],
        version: 1,
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

    await expect(getLocalFriends()).resolves.toEqual([{ addedAt: 50, login: 'saved_friend' }]);
  });
});
