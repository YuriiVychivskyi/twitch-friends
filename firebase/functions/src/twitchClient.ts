export type TwitchUser = {
  avatarUrl: string;
  displayName: string;
  id: string;
  login: string;
};

type TwitchCredentials = {
  clientId: string;
  clientSecret: string;
};

export type TwitchTokenIdentity = {
  clientId: string;
  login: string;
  userId: string;
};

type Fetcher = typeof fetch;

export class TwitchClient {
  private accessToken = '';
  private accessTokenExpiresAt = 0;

  constructor(
    private readonly credentials: TwitchCredentials,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  private async getAccessToken() {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) {
      return this.accessToken;
    }

    const body = new URLSearchParams({
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      grant_type: 'client_credentials',
    });
    const response = await this.fetcher('https://id.twitch.tv/oauth2/token', {
      body,
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Twitch token request failed with status ${response.status}.`);
    }

    const value: unknown = await response.json();

    if (!value || typeof value !== 'object') {
      throw new Error('Twitch returned an invalid token response.');
    }

    const token = value as Record<string, unknown>;

    if (typeof token.access_token !== 'string' || typeof token.expires_in !== 'number') {
      throw new Error('Twitch returned an incomplete token response.');
    }

    this.accessToken = token.access_token;
    this.accessTokenExpiresAt = Date.now() + Math.max(0, token.expires_in - 60) * 1_000;

    return this.accessToken;
  }

  async exchangeAuthorizationCode(code: string, redirectUri: string) {
    const body = new URLSearchParams({
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
    const response = await this.fetcher('https://id.twitch.tv/oauth2/token', {
      body,
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Twitch authorization failed with status ${response.status}.`);
    }

    const value: unknown = await response.json();

    if (!value || typeof value !== 'object') {
      throw new Error('Twitch returned an invalid authorization response.');
    }

    const tokens = value as Record<string, unknown>;

    if (typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string') {
      throw new Error('Twitch returned an incomplete authorization response.');
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    };
  }

  async validateUserAccessToken(accessToken: string): Promise<TwitchTokenIdentity> {
    const response = await this.fetcher('https://id.twitch.tv/oauth2/validate', {
      headers: {
        Authorization: `OAuth ${accessToken}`,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Twitch token validation failed with status ${response.status}.`);
    }

    const value: unknown = await response.json();

    if (!value || typeof value !== 'object') {
      throw new Error('Twitch returned an invalid token validation response.');
    }

    const identity = value as Record<string, unknown>;

    if (
      typeof identity.client_id !== 'string' ||
      typeof identity.login !== 'string' ||
      typeof identity.user_id !== 'string'
    ) {
      throw new Error('Twitch token does not identify a user.');
    }

    return {
      clientId: identity.client_id,
      login: identity.login.toLowerCase(),
      userId: identity.user_id,
    };
  }

  async revokeToken(token: string) {
    const response = await this.fetcher('https://id.twitch.tv/oauth2/revoke', {
      body: new URLSearchParams({
        client_id: this.credentials.clientId,
        token,
      }),
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Twitch token revocation failed with status ${response.status}.`);
    }
  }

  async getUser(login: string): Promise<TwitchUser | null> {
    const accessToken = await this.getAccessToken();
    const url = new URL('https://api.twitch.tv/helix/users');

    url.searchParams.set('login', login);

    const response = await this.fetcher(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': this.credentials.clientId,
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Twitch user request failed with status ${response.status}.`);
    }

    const value: unknown = await response.json();

    if (!value || typeof value !== 'object') {
      throw new Error('Twitch returned an invalid user response.');
    }

    const data = (value as Record<string, unknown>).data;

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const user = data[0] as Record<string, unknown>;

    if (
      typeof user.id !== 'string' ||
      typeof user.login !== 'string' ||
      typeof user.display_name !== 'string' ||
      typeof user.profile_image_url !== 'string'
    ) {
      throw new Error('Twitch returned an incomplete user response.');
    }

    return {
      avatarUrl: user.profile_image_url,
      displayName: user.display_name,
      id: user.id,
      login: user.login.toLowerCase(),
    };
  }
}
