import { enableAccountSetup } from '@/features/profile/accountState';
import { BackendError, requestBackend } from '@/infrastructure/backend/backendApi';

type TwitchAuthorizationStart = {
  authorizationUrl: string;
};

function isAuthorizationStart(value: unknown): value is TwitchAuthorizationStart {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const authorizationUrl = (value as Record<string, unknown>).authorizationUrl;

  if (typeof authorizationUrl !== 'string') {
    return false;
  }

  try {
    const url = new URL(authorizationUrl);

    return (
      authorizationUrl.length <= 2_048 &&
      url.origin === 'https://id.twitch.tv' &&
      url.pathname === '/oauth2/authorize' &&
      url.username === '' &&
      url.password === '' &&
      url.searchParams.get('response_type') === 'code' &&
      /^[a-f0-9]{64}$/u.test(url.searchParams.get('state') ?? '')
    );
  } catch {
    return false;
  }
}

export async function authorizeWithTwitch() {
  await enableAccountSetup();

  try {
    const result = await requestBackend<TwitchAuthorizationStart>('/api/oauth/start', {
      method: 'POST',
    });

    if (!isAuthorizationStart(result)) {
      throw new Error('Profile backend returned an invalid authorization URL.');
    }

    await browser.tabs.create({
      url: result.authorizationUrl,
    });
  } catch (cause) {
    if (cause instanceof BackendError && cause.code === 'permission-denied') {
      throw new Error('This extension origin is not allowed.', { cause });
    }

    if (cause instanceof BackendError && cause.code === 'resource-exhausted') {
      throw new Error('Wait a few seconds before trying again.', { cause });
    }

    if (cause instanceof BackendError && ['internal', 'unavailable'].includes(cause.code)) {
      throw new Error('Profile backend is unavailable.', { cause });
    }

    throw cause;
  }
}
