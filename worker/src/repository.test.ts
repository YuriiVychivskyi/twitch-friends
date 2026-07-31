import { describe, expect, it, vi } from 'vitest';

import { listFriendshipEdges, respondToFriendRequest } from './repository';

type UserRow = {
  avatar_url: string;
  display_name: string;
  firebase_uid: string;
  login: string;
  twitch_id: string;
};

const alice: UserRow = {
  avatar_url: 'https://example.test/alice.png',
  display_name: 'Alice',
  firebase_uid: 'alice-uid',
  login: 'alice',
  twitch_id: '1',
};
const bob: UserRow = {
  avatar_url: 'https://example.test/bob.png',
  display_name: 'Bob',
  firebase_uid: 'bob-uid',
  login: 'bob',
  twitch_id: '2',
};

describe('Friendship repository controls', () => {
  it('rejects an accepted friendship when either account has 100 friends', async () => {
    const results = [alice, bob, { found: 1 }, { count: 100 }, { count: 4 }];
    const batch = vi.fn();
    const database = {
      batch,
      prepare() {
        return {
          bind() {
            return {
              first() {
                return Promise.resolve(results.shift() ?? null);
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    await expect(
      respondToFriendRequest(database, 'alice-uid', 'bob-uid', true),
    ).rejects.toMatchObject({
      code: 'resource-exhausted',
      status: 409,
    });
    expect(batch).not.toHaveBeenCalled();
  });

  it('maps only canonical D1 friendship rows to Firebase UID edges', async () => {
    const database = {
      prepare() {
        return {
          all() {
            return Promise.resolve({
              results: [{ user_a_uid: 'alice-uid', user_b_uid: 'bob-uid' }],
            });
          },
        };
      },
    } as unknown as D1Database;

    await expect(listFriendshipEdges(database)).resolves.toEqual([
      { userAUid: 'alice-uid', userBUid: 'bob-uid' },
    ]);
  });
});
