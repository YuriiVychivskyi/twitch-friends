import { describe, expect, it, vi } from 'vitest';

import { TwitchClient } from './twitchClient';

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });
}

describe('TwitchClient', () => {
  it('returns a normalized Twitch user', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token', expires_in: 3600 }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              display_name: 'TestUser',
              id: '123',
              login: 'TestUser',
              profile_image_url: 'https://static-cdn.jtvnw.net/avatar.png',
            },
          ],
        }),
      );
    const client = new TwitchClient(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
      fetcher,
    );

    await expect(client.getUser('testuser')).resolves.toEqual({
      avatarUrl: 'https://static-cdn.jtvnw.net/avatar.png',
      displayName: 'TestUser',
      id: '123',
      login: 'testuser',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('returns null when the Twitch user does not exist', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));
    const client = new TwitchClient(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
      fetcher,
    );

    await expect(client.getUser('missing')).resolves.toBeNull();
  });

  it('reuses a valid app access token', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token', expires_in: 3600 }))
      .mockImplementation(() => Promise.resolve(jsonResponse({ data: [] })));
    const client = new TwitchClient(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
      fetcher,
    );

    await client.getUser('first');
    await client.getUser('second');

    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
