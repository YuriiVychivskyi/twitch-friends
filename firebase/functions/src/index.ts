import { defineJsonSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { TwitchClient } from './twitchClient';

type TwitchApiConfig = {
  clientId: string;
  clientSecret: string;
};

const twitchApiConfig = defineJsonSecret<TwitchApiConfig>('TWITCH_API_CONFIG');

let twitchClient: TwitchClient | null = null;

export const lookupTwitchUser = onCall(
  {
    region: 'europe-west1',
    secrets: [twitchApiConfig],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const data = request.data as Record<string, unknown> | null;
    const requestedLogin = data?.login;
    const login = typeof requestedLogin === 'string' ? requestedLogin.trim().toLowerCase() : '';

    if (!/^[a-z0-9_]{1,25}$/u.test(login)) {
      throw new HttpsError('invalid-argument', 'Enter a valid Twitch login.');
    }

    const config = twitchApiConfig.value();

    if (!config.clientId || !config.clientSecret) {
      throw new HttpsError('failed-precondition', 'Twitch API is not configured.');
    }

    twitchClient ??= new TwitchClient(config);

    try {
      return await twitchClient.getUser(login);
    } catch {
      throw new HttpsError('unavailable', 'Twitch API is temporarily unavailable.');
    }
  },
);
