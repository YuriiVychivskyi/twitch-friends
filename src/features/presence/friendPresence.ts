import { browser } from 'wxt/browser';

import { isTwitchChannel, type TwitchChannel } from '@/features/presence/twitchChannel';

export type FriendPresence = {
  channel: TwitchChannel;
  expiresAt: number;
  friendId: string;
  login: string;
};

export const FRIEND_PRESENCE_KEY = 'friend-presence';

export function parseFriendPresence(value: unknown) {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const stored = value as Record<string, unknown>;

  if (stored.version !== 1 || !Array.isArray(stored.items)) {
    return [];
  }

  return stored.items.filter((item): item is FriendPresence => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const presence = item as Record<string, unknown>;

    return (
      typeof presence.expiresAt === 'number' &&
      Number.isSafeInteger(presence.expiresAt) &&
      presence.expiresAt > Date.now() &&
      typeof presence.friendId === 'string' &&
      /^[a-z0-9_-]{1,128}$/iu.test(presence.friendId) &&
      typeof presence.login === 'string' &&
      isTwitchChannel(presence.channel)
    );
  });
}

export async function saveFriendPresence(items: FriendPresence[]) {
  await browser.storage.local.set({
    [FRIEND_PRESENCE_KEY]: {
      items,
      version: 1,
    },
  });
}

export async function getFriendPresence() {
  const stored = await browser.storage.local.get(FRIEND_PRESENCE_KEY);

  return parseFriendPresence(stored[FRIEND_PRESENCE_KEY]);
}
