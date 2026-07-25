import { browser } from 'wxt/browser';

import { type TwitchUserProfile } from '@/features/friends/twitchUserLookup';
import { normalizeTwitchLogin } from '@/features/presence/twitchChannel';

export type LocalFriend = {
  addedAt: number;
  avatarUrl: string;
  displayName: string;
  login: string;
  twitchId: string;
};

export const LOCAL_FRIENDS_KEY = 'friends';

export function parseLocalFriends(value: unknown): LocalFriend[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const stored = value as Record<string, unknown>;

  if (![1, 2].includes(stored.version as number) || !Array.isArray(stored.items)) {
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
      avatarUrl: typeof friend.avatarUrl === 'string' ? friend.avatarUrl : '',
      displayName: typeof friend.displayName === 'string' ? friend.displayName : login,
      login,
      twitchId: typeof friend.twitchId === 'string' ? friend.twitchId : '',
    });
    logins.add(login);
  }

  return friends;
}

async function saveLocalFriends(friends: LocalFriend[]) {
  await browser.storage.local.set({
    [LOCAL_FRIENDS_KEY]: {
      items: friends,
      version: 2,
    },
  });
}

export async function getLocalFriends() {
  const stored = await browser.storage.local.get(LOCAL_FRIENDS_KEY);

  return parseLocalFriends(stored[LOCAL_FRIENDS_KEY]);
}

export async function addLocalFriend(profile: TwitchUserProfile) {
  const login = normalizeTwitchLogin(profile.login);

  if (!login) {
    throw new Error('Twitch returned an invalid login.');
  }

  const friends = await getLocalFriends();
  const friend: LocalFriend = {
    addedAt: Date.now(),
    avatarUrl: profile.avatarUrl,
    displayName: profile.displayName,
    login,
    twitchId: profile.id,
  };
  const existingFriendIndex = friends.findIndex((item) => item.login === login);

  if (existingFriendIndex >= 0) {
    const existingFriend = friends[existingFriendIndex];

    friend.addedAt = existingFriend?.addedAt ?? friend.addedAt;
    friends[existingFriendIndex] = friend;
    await saveLocalFriends(friends);
  } else {
    await saveLocalFriends([...friends, friend]);
  }

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
