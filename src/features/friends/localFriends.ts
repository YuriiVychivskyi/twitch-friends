import { browser } from 'wxt/browser';

import { type TwitchUserProfile } from '@/features/friends/twitchUserProfile';
import { normalizeTwitchLogin } from '@/features/presence/twitchChannel';

export type LocalFriend = {
  avatarUrl: string;
  displayName: string;
  login: string;
};

export const LOCAL_FRIENDS_KEY = 'friends';

export function parseLocalFriends(value: unknown): LocalFriend[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const stored = value as Record<string, unknown>;

  if (![1, 2, 3].includes(stored.version as number) || !Array.isArray(stored.items)) {
    return [];
  }

  const friends: LocalFriend[] = [];
  const logins = new Set<string>();

  for (const item of stored.items) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const friend = item as Record<string, unknown>;
    const login = typeof friend.login === 'string' ? normalizeTwitchLogin(friend.login) : null;

    if (!login || logins.has(login)) {
      continue;
    }

    friends.push({
      avatarUrl: typeof friend.avatarUrl === 'string' ? friend.avatarUrl : '',
      displayName: typeof friend.displayName === 'string' ? friend.displayName : login,
      login,
    });
    logins.add(login);
  }

  return friends;
}

async function saveLocalFriends(friends: LocalFriend[]) {
  await browser.storage.local.set({
    [LOCAL_FRIENDS_KEY]: {
      items: friends,
      version: 3,
    },
  });
}

export async function getLocalFriends() {
  const stored = await browser.storage.local.get(LOCAL_FRIENDS_KEY);

  return parseLocalFriends(stored[LOCAL_FRIENDS_KEY]);
}

export async function replaceLocalFriends(profiles: TwitchUserProfile[]) {
  const friends = profiles.map((profile) => {
    const login = normalizeTwitchLogin(profile.login);

    if (!login) {
      throw new Error('Friends backend returned an invalid login.');
    }

    return {
      avatarUrl: profile.avatarUrl,
      displayName: profile.displayName,
      login,
    };
  });

  await saveLocalFriends(friends);

  return friends;
}
