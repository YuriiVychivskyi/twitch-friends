export type TwitchChannel = {
  login: string;
  url: string;
};

export const ACTIVE_CHANNEL_GET = 'active-channel:get';
export const ACTIVE_CHANNEL_UPDATE = 'active-channel:update';

const RESERVED_PATHS = new Set([
  'browse',
  'directory',
  'downloads',
  'drops',
  'following',
  'inventory',
  'jobs',
  'login',
  'search',
  'settings',
  'signup',
  'subscriptions',
  'turbo',
  'videos',
  'wallet',
]);

export function normalizeTwitchLogin(value: string) {
  const login = value.trim().toLowerCase();

  if (RESERVED_PATHS.has(login) || !/^[a-z0-9_]{1,25}$/u.test(login)) {
    return null;
  }

  return login;
}

export function parseTwitchChannel(value: string): TwitchChannel | null {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || !['twitch.tv', 'www.twitch.tv'].includes(url.hostname)) {
    return null;
  }

  const segments = url.pathname.split('/').filter(Boolean);

  if (segments.length !== 1) {
    return null;
  }

  const login = normalizeTwitchLogin(segments[0] ?? '');

  if (!login) {
    return null;
  }

  return {
    login,
    url: `https://www.twitch.tv/${login}`,
  };
}

export function isTwitchChannel(value: unknown): value is TwitchChannel {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const channel = value as Record<string, unknown>;

  return (
    Object.keys(channel).length === 2 &&
    typeof channel.login === 'string' &&
    typeof channel.url === 'string' &&
    parseTwitchChannel(channel.url)?.login === channel.login
  );
}

export function isActiveChannelUpdate(
  value: unknown,
): value is { channel: TwitchChannel | null; type: typeof ACTIVE_CHANNEL_UPDATE } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as Record<string, unknown>;

  return (
    Object.keys(message).length === 2 &&
    message.type === ACTIVE_CHANNEL_UPDATE &&
    (message.channel === null || isTwitchChannel(message.channel))
  );
}

export function isActiveChannelRequest(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as Record<string, unknown>;

  return Object.keys(message).length === 1 && message.type === ACTIVE_CHANNEL_GET;
}
