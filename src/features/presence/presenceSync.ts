import { onValue, ref, remove, set, type Unsubscribe } from 'firebase/database';

import { normalizeTwitchLogin } from '@/features/presence/twitchChannel';
import {
  decryptPresence,
  encryptPresence,
  type EncryptedPresence,
} from '@/features/presence/presenceCrypto';
import { saveFriendPresence, type FriendPresence } from '@/features/presence/friendPresence';
import { isPresenceHeartbeatDue } from '@/features/presence/presenceHeartbeat';
import { type TwitchChannel } from '@/features/presence/twitchChannel';
import { requestBackend } from '@/infrastructure/backend/backendApi';
import { ensureAnonymousAuth } from '@/infrastructure/firebase/firebaseAuth';
import { getFirebaseDatabase } from '@/infrastructure/firebase/firebaseDatabase';
import { getOrCreateLocalIdentity } from '@/security/identity/localIdentity';
import type { LocalIdentity, PublicIdentityKey } from '@/security/identity/localIdentityTypes';

type PresenceFriend = {
  encryptionKey: PublicIdentityKey;
  id: string;
  login: string;
};

let activeChannel: TwitchChannel | null = null;
let friends: PresenceFriend[] = [];
let identity: LocalIdentity | null = null;
let lastPresencePublishAt = 0;
let presenceExpiryTimer: ReturnType<typeof setTimeout> | null = null;
let presencePublishTimer: ReturnType<typeof setTimeout> | null = null;
let publishedRecipients = new Set<string>();
let presenceRevision = 0;
let publishQueue = Promise.resolve();
let refreshPromise: Promise<void> | null = null;
let timersStarted = false;
let unsubscribePresence: Unsubscribe | null = null;
let uid = '';

const presencePublishInterval = 30_000;
const presencePublishDelay = 3_000;
const presenceServiceRefreshInterval = 45 * 60_000;

function reportPresenceError(action: string, cause: unknown) {
  const message = cause instanceof Error ? cause.message : 'Unknown error';

  console.error(`[Twitch Friends] ${action}: ${message}`);
}

function parsePublicKey(value: unknown): PublicIdentityKey | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const key = value as Record<string, unknown>;

  if (
    key.crv !== 'P-256' ||
    key.kty !== 'EC' ||
    typeof key.x !== 'string' ||
    typeof key.y !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/u.test(key.x) ||
    !/^[A-Za-z0-9_-]{43}$/u.test(key.y)
  ) {
    return null;
  }

  return {
    crv: key.crv,
    kty: key.kty,
    x: key.x,
    y: key.y,
  };
}

function parsePresenceFriends(value: unknown): PresenceFriend[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const friend = item as Record<string, unknown>;
    const profile =
      friend.profile && typeof friend.profile === 'object'
        ? (friend.profile as Record<string, unknown>)
        : {};
    const encryptionKey = parsePublicKey(friend.encryptionKey);

    const login = typeof profile.login === 'string' ? normalizeTwitchLogin(profile.login) : null;

    if (
      !encryptionKey ||
      typeof friend.id !== 'string' ||
      !/^[a-z0-9_-]{1,128}$/iu.test(friend.id) ||
      !login
    ) {
      return [];
    }

    return [
      {
        encryptionKey,
        id: friend.id,
        login,
      },
    ];
  });
}

function parseEncryptedPresence(value: unknown): EncryptedPresence | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const presence = value as Record<string, unknown>;

  if (
    typeof presence.ciphertext !== 'string' ||
    !/^[A-Za-z0-9_-]{16,512}$/u.test(presence.ciphertext) ||
    typeof presence.expiresAt !== 'number' ||
    !Number.isSafeInteger(presence.expiresAt) ||
    typeof presence.iv !== 'string' ||
    !/^[A-Za-z0-9_-]{16}$/u.test(presence.iv) ||
    presence.version !== 1
  ) {
    return null;
  }

  return {
    ciphertext: presence.ciphertext,
    expiresAt: presence.expiresAt,
    iv: presence.iv,
    version: 1,
  };
}

async function registerIdentity(localIdentity: LocalIdentity) {
  await requestBackend('/api/identity', {
    body: {
      encryptionKey: localIdentity.encryptionPublicKey,
    },
    method: 'PUT',
  });
}

async function refreshFriends() {
  const result = await requestBackend<unknown>('/api/presence-friends');

  friends = parsePresenceFriends(result);
}

async function clearPublishedPresence() {
  const database = getFirebaseDatabase();

  await Promise.all(
    [...publishedRecipients].map((recipientUid) =>
      remove(ref(database, `presence/${recipientUid}/${uid}`)),
    ),
  );
  publishedRecipients = new Set();
}

async function publishPresence() {
  if (!identity || !uid) {
    return;
  }

  if (!activeChannel) {
    await clearPublishedPresence();
    return;
  }

  const database = getFirebaseDatabase();
  const nextRecipients = new Set(friends.map((friend) => friend.id));

  const publishResults = await Promise.allSettled(
    friends.map(async (friend) => {
      if (!identity || !activeChannel) {
        return;
      }

      const reference = ref(database, `presence/${friend.id}/${uid}`);
      const encrypted = await encryptPresence(identity, friend.encryptionKey, activeChannel);

      await set(reference, encrypted);
    }),
  );
  const removalResults = await Promise.allSettled(
    [...publishedRecipients]
      .filter((recipientUid) => !nextRecipients.has(recipientUid))
      .map((recipientUid) => remove(ref(database, `presence/${recipientUid}/${uid}`))),
  );
  publishedRecipients = nextRecipients;
  lastPresencePublishAt = Date.now();

  for (const result of [...publishResults, ...removalResults]) {
    if (result.status === 'rejected') {
      reportPresenceError('Presence update failed', result.reason);
    }
  }
}

function queuePresencePublish() {
  const nextPublish = publishQueue.catch(() => undefined).then(publishPresence);

  publishQueue = nextPublish;

  return nextPublish;
}

function schedulePresenceExpiry(items: FriendPresence[], revision: number) {
  if (presenceExpiryTimer !== null) {
    clearTimeout(presenceExpiryTimer);
    presenceExpiryTimer = null;
  }

  if (items.length === 0) {
    return;
  }

  const earliestExpiry = Math.min(...items.map((item) => item.expiresAt));

  presenceExpiryTimer = setTimeout(
    () => {
      presenceExpiryTimer = null;

      if (revision !== presenceRevision) {
        return;
      }

      const remainingItems = items.filter((item) => item.expiresAt > Date.now());

      void saveFriendPresence(remainingItems)
        .then(() => schedulePresenceExpiry(remainingItems, revision))
        .catch(() => undefined);
    },
    Math.max(0, earliestExpiry - Date.now() + 50),
  );
}

function listenForPresence() {
  if (!identity || !uid) {
    return;
  }

  unsubscribePresence?.();
  if (presenceExpiryTimer !== null) {
    clearTimeout(presenceExpiryTimer);
    presenceExpiryTimer = null;
  }
  presenceRevision += 1;

  const localIdentity = identity;
  const database = getFirebaseDatabase();

  unsubscribePresence = onValue(
    ref(database, `presence/${uid}`),
    (snapshot) => {
      const revision = ++presenceRevision;
      const value: unknown = snapshot.val();
      const records = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

      void Promise.all(
        friends.map(async (friend): Promise<FriendPresence | null> => {
          const encrypted = parseEncryptedPresence(records[friend.id]);

          if (!encrypted) {
            return null;
          }

          const channel = await decryptPresence(localIdentity, friend.encryptionKey, encrypted);

          return channel
            ? {
                channel,
                expiresAt: encrypted.expiresAt,
                friendId: friend.id,
                login: friend.login,
              }
            : null;
        }),
      )
        .then(async (items) => {
          if (revision !== presenceRevision) {
            return;
          }

          const validItems = items.filter((item) => item !== null);

          await saveFriendPresence(validItems);
          schedulePresenceExpiry(validItems, revision);
        })
        .catch(() => {
          if (revision === presenceRevision) {
            void saveFriendPresence([]).catch(() => undefined);
          }
        });
    },
    () => {
      presenceRevision += 1;
      if (presenceExpiryTimer !== null) {
        clearTimeout(presenceExpiryTimer);
        presenceExpiryTimer = null;
      }
      void saveFriendPresence([]);
    },
  );
}

async function refreshPresenceState() {
  await refreshFriends();
  listenForPresence();
  await queuePresencePublish();
}

function startPresenceTimers() {
  if (timersStarted) {
    return;
  }

  timersStarted = true;
  globalThis.setInterval(() => {
    void queuePresencePublish().catch((cause: unknown) => {
      reportPresenceError('Presence heartbeat failed', cause);
    });
  }, presencePublishInterval);
  globalThis.setInterval(() => {
    void refreshPresenceFriends().catch((cause: unknown) => {
      reportPresenceError('Presence service refresh failed', cause);
    });
  }, presenceServiceRefreshInterval);
}

export async function startPresenceSync(channel: TwitchChannel | null) {
  activeChannel = channel;
  uid = await ensureAnonymousAuth();
  identity = await getOrCreateLocalIdentity();

  await registerIdentity(identity);
  startPresenceTimers();
  await refreshPresenceState();
}

export function updatePresenceChannel(channel: TwitchChannel | null) {
  activeChannel = channel;

  if (presencePublishTimer !== null) {
    clearTimeout(presencePublishTimer);
  }

  presencePublishTimer = setTimeout(() => {
    presencePublishTimer = null;
    void queuePresencePublish().catch((cause: unknown) => {
      reportPresenceError('Presence channel update failed', cause);
    });
  }, presencePublishDelay);
}

export function refreshPresenceHeartbeat() {
  if (!activeChannel || !isPresenceHeartbeatDue(lastPresencePublishAt)) {
    return;
  }

  void queuePresencePublish().catch((cause: unknown) => {
    reportPresenceError('Presence content heartbeat failed', cause);
  });
}

export function refreshPresenceFriends() {
  refreshPromise ??= refreshPresenceState().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}
