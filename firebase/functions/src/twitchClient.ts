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
