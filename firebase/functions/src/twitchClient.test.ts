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

  it('exchanges an authorization code without exposing the client secret in the URL', async () => {
    let requestBody: BodyInit | null | undefined;
    const fetcher = vi.fn<typeof fetch>((_, request) => {
      requestBody = request?.body;

      return Promise.resolve(
        jsonResponse({
          access_token: 'user-access-token',
          refresh_token: 'user-refresh-token',
        }),
      );
    });
    const client = new TwitchClient(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
      fetcher,
    );

    await expect(
      client.exchangeAuthorizationCode(
        'authorization-code',
        'http://localhost:5001/demo-twitch-friends/europe-west1/twitchOAuthCallback',
      ),
    ).resolves.toEqual({
      accessToken: 'user-access-token',
      refreshToken: 'user-refresh-token',
    });

    const body = requestBody as URLSearchParams;

    expect(fetcher).toHaveBeenCalledWith('https://id.twitch.tv/oauth2/token', expect.any(Object));
    expect(body.get('client_secret')).toBe('client-secret');
    expect(body.get('code')).toBe('authorization-code');
  });

  it('returns the Twitch identity carried by a validated user token', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        client_id: 'client-id',
        login: 'TestUser',
        user_id: '123',
      }),
    );
    const client = new TwitchClient(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
      fetcher,
    );

    await expect(client.validateUserAccessToken('user-token')).resolves.toEqual({
      clientId: 'client-id',
      login: 'testuser',
      userId: '123',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://id.twitch.tv/oauth2/validate',
      expect.objectContaining({
        headers: {
          Authorization: 'OAuth user-token',
        },
      }),
    );
  });

  it('revokes a Twitch token after one-time ownership verification', async () => {
    let requestBody: BodyInit | null | undefined;
    const fetcher = vi.fn<typeof fetch>((_, request) => {
      requestBody = request?.body;

      return Promise.resolve(new Response(null, { status: 200 }));
    });
    const client = new TwitchClient(
      {
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
      fetcher,
    );

    await expect(client.revokeToken('user-token')).resolves.toBeUndefined();

    const body = requestBody as URLSearchParams;

    expect(fetcher).toHaveBeenCalledWith('https://id.twitch.tv/oauth2/revoke', expect.any(Object));
    expect(body.get('client_id')).toBe('client-id');
    expect(body.get('token')).toBe('user-token');
  });
});
