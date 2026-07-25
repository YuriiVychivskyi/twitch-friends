import { browser } from 'wxt/browser';

import { normalizeTwitchLogin } from '@/features/presence/twitchChannel';

export type LocalFriend = {
  addedAt: number;
  login: string;
};

const FRIENDS_KEY = 'friends';

export function parseLocalFriends(value: unknown): LocalFriend[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const stored = value as Record<string, unknown>;

  if (stored.version !== 1 || !Array.isArray(stored.items)) {
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

    if (
      !login ||
      logins.has(login) ||
      typeof friend.addedAt !== 'number' ||
      !Number.isSafeInteger(friend.addedAt) ||
      friend.addedAt < 0
    ) {
      continue;
    }

    friends.push({
      addedAt: friend.addedAt,
      login,
    });
    logins.add(login);
  }

  return friends;
}

async function saveLocalFriends(friends: LocalFriend[]) {
  await browser.storage.local.set({
    [FRIENDS_KEY]: {
      items: friends,
      version: 1,
    },
  });
}

export async function getLocalFriends() {
  const stored = await browser.storage.local.get(FRIENDS_KEY);

  return parseLocalFriends(stored[FRIENDS_KEY]);
}

export async function addLocalFriend(value: string) {
  const login = normalizeTwitchLogin(value);

  if (!login) {
    throw new Error('Enter a valid Twitch login.');
  }

  const friends = await getLocalFriends();
  const existingFriend = friends.find((friend) => friend.login === login);

  if (existingFriend) {
    return existingFriend;
  }

  const friend: LocalFriend = {
    addedAt: Date.now(),
    login,
  };

  await saveLocalFriends([...friends, friend]);

  return friend;
}

export async function removeLocalFriend(value: string) {
  const login = normalizeTwitchLogin(value);

  if (!login) {
    return false;
  }

  const friends = await getLocalFriends();
  const nextFriends = friends.filter((friend) => friend.login !== login);

  if (nextFriends.length === friends.length) {
    return false;
  }

  await saveLocalFriends(nextFriends);

  return true;
}
