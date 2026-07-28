import { ApiError } from './errors';
import type { TwitchUser } from './types';
import { isTwitchUser } from './validation';

type TwitchCredentials = {
  clientId: string;
  clientSecret: string;
};

type TwitchTokenIdentity = {
  clientId: string;
  login: string;
  userId: string;
};

let appAccessToken = '';
let appAccessTokenExpiresAt = 0;

async function readResponseObject(response: Response) {
  const value: unknown = await response.json();

  if (!value || typeof value !== 'object') {
    throw new ApiError(502, 'twitch-unavailable', 'Twitch returned invalid data.');
  }

  return value as Record<string, unknown>;
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
}

export class TwitchClient {
  constructor(private readonly credentials: TwitchCredentials) {}

  private async getAppAccessToken() {
    if (appAccessToken && Date.now() < appAccessTokenExpiresAt) {
      return appAccessToken;
    }

    const response = await fetchWithTimeout('https://id.twitch.tv/oauth2/token', {
      body: new URLSearchParams({
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        grant_type: 'client_credentials',
      }),
      method: 'POST',
    });

    if (!response.ok) {
      throw new ApiError(502, 'twitch-unavailable', 'Twitch authentication failed.');
    }

    const value = await readResponseObject(response);

    if (typeof value.access_token !== 'string' || typeof value.expires_in !== 'number') {
      throw new ApiError(502, 'twitch-unavailable', 'Twitch returned invalid authentication data.');
    }

    appAccessToken = value.access_token;
    appAccessTokenExpiresAt = Date.now() + Math.max(0, value.expires_in - 60) * 1_000;

    return appAccessToken;
  }

  async exchangeAuthorizationCode(code: string, redirectUri: string) {
    const response = await fetchWithTimeout('https://id.twitch.tv/oauth2/token', {
      body: new URLSearchParams({
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
      method: 'POST',
    });

    if (!response.ok) {
      throw new ApiError(400, 'oauth-failed', 'Twitch authorization failed.');
    }

    const value = await readResponseObject(response);

    if (typeof value.access_token !== 'string' || typeof value.refresh_token !== 'string') {
      throw new ApiError(400, 'oauth-failed', 'Twitch returned invalid authorization data.');
    }

    return {
      accessToken: value.access_token,
      refreshToken: value.refresh_token,
    };
  }

  async validateUserAccessToken(accessToken: string): Promise<TwitchTokenIdentity> {
    const response = await fetchWithTimeout('https://id.twitch.tv/oauth2/validate', {
      headers: {
        Authorization: `OAuth ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new ApiError(400, 'oauth-failed', 'Twitch token validation failed.');
    }

    const value = await readResponseObject(response);

    if (
      typeof value.client_id !== 'string' ||
      typeof value.login !== 'string' ||
      typeof value.user_id !== 'string'
    ) {
      throw new ApiError(400, 'oauth-failed', 'Twitch token does not identify a user.');
    }

    return {
      clientId: value.client_id,
      login: value.login.toLowerCase(),
      userId: value.user_id,
    };
  }

  async getUser(login: string): Promise<TwitchUser | null> {
    const accessToken = await this.getAppAccessToken();
    const url = new URL('https://api.twitch.tv/helix/users');

    url.searchParams.set('login', login);

    const response = await fetchWithTimeout(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': this.credentials.clientId,
      },
    });

    if (!response.ok) {
      throw new ApiError(502, 'twitch-unavailable', 'Twitch profile lookup failed.');
    }

    const value = await readResponseObject(response);
    const data = value.data;

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const user = data[0] as Record<string, unknown>;
    const profile = {
      avatarUrl: user.profile_image_url,
      displayName: user.display_name,
      id: user.id,
      login: typeof user.login === 'string' ? user.login.toLowerCase() : user.login,
    };

    if (!isTwitchUser(profile)) {
      throw new ApiError(502, 'twitch-unavailable', 'Twitch returned invalid profile data.');
    }

    return profile;
  }

  async revokeToken(token: string) {
    await fetchWithTimeout('https://id.twitch.tv/oauth2/revoke', {
      body: new URLSearchParams({
        client_id: this.credentials.clientId,
        token,
      }),
      method: 'POST',
    });
  }
}
