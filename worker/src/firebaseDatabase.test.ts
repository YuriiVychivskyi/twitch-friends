import { afterEach, describe, expect, it, vi } from 'vitest';

import { replaceFriendshipGraph, syncFriendshipNodes } from './firebaseDatabase';
import type { Env } from './types';

function createEnvironment(overrides: Partial<Env> = {}) {
  return {
    ALLOWED_EXTENSION_ORIGINS: 'chrome-extension://allowed',
    ALLOW_INSECURE_EMULATOR_AUTH: 'true',
    FIREBASE_PROJECT_ID: 'demo-twitch-friends',
    ...overrides,
  } as Env;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Firebase friendship cache', () => {
  it('writes only affected canonical nodes to the local emulator', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    await syncFriendshipNodes(
      createEnvironment(),
      [
        { userAUid: 'alice', userBUid: 'bob' },
        { userAUid: 'bob', userBUid: 'charlie' },
      ],
      ['alice', 'charlie', 'dave'],
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [URL, RequestInit];

    expect(url.toString()).toBe('http://127.0.0.1:9000/friendships.json?ns=demo-twitch-friends');
    expect(request.method).toBe('PATCH');
    expect(JSON.parse(request.body as string)).toEqual({
      alice: { bob: true },
      charlie: { bob: true },
      dave: null,
    });
    expect(request.headers).not.toHaveProperty('Authorization');
  });

  it('replaces the cache with a reciprocal graph during reconciliation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    await replaceFriendshipGraph(createEnvironment(), [{ userAUid: 'alice', userBUid: 'bob' }]);

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];

    expect(request.method).toBe('PUT');
    expect(JSON.parse(request.body as string)).toEqual({
      alice: { bob: true },
      bob: { alice: true },
    });
  });

  it('fails closed when production admin credentials are missing', async () => {
    await expect(
      syncFriendshipNodes(
        createEnvironment({
          ALLOW_INSECURE_EMULATOR_AUTH: undefined,
          FIREBASE_PROJECT_ID: 'twitch-friends-2ea03',
        }),
        [],
        ['alice'],
      ),
    ).rejects.toMatchObject({ code: 'unavailable', status: 503 });
  });

  it('rejects a production database URL for another Firebase project', async () => {
    await expect(
      syncFriendshipNodes(
        createEnvironment({
          ALLOW_INSECURE_EMULATOR_AUTH: undefined,
          FIREBASE_ADMIN_CONFIG: JSON.stringify({
            clientEmail: 'worker@example.iam.gserviceaccount.com',
            databaseUrl: 'https://another-project-default-rtdb.firebaseio.com',
            privateKey: 'invalid',
          }),
          FIREBASE_PROJECT_ID: 'twitch-friends-2ea03',
        }),
        [],
        ['alice'],
      ),
    ).rejects.toMatchObject({ code: 'unavailable', status: 503 });
  });
});
