import { FirebaseError } from 'firebase/app';
import { onDisconnect, onValue, ref, remove, set, type Unsubscribe } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';

import { getPrivacySettings } from '@/features/privacy/privacySettings';
import { normalizeTwitchLogin } from '@/features/presence/twitchChannel';
import {
  decryptPresence,
  encryptPresence,
  type EncryptedPresence,
} from '@/features/presence/presenceCrypto';
import { saveFriendPresence, type FriendPresence } from '@/features/presence/friendPresence';
import { type TwitchChannel } from '@/features/presence/twitchChannel';
import { ensureAnonymousAuth } from '@/infrastructure/firebase/firebaseAuth';
import { getFirebaseDatabase } from '@/infrastructure/firebase/firebaseDatabase';
import { getFirebaseFunctions } from '@/infrastructure/firebase/firebaseFunctions';
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
let presenceExpiryTimer: ReturnType<typeof setTimeout> | null = null;
let publishedRecipients = new Set<string>();
let presenceRevision = 0;
let publishQueue = Promise.resolve();
let unsubscribePresence: Unsubscribe | null = null;
let uid = '';

const presencePublishInterval = 30_000;
const presenceServiceRefreshInterval = 45 * 60_000;

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
  const register = httpsCallable(getFirebaseFunctions(), 'registerPublicIdentity');

  await register({
    encryptionKey: localIdentity.encryptionPublicKey,
  });
}

async function refreshFriends() {
  const getFriends = httpsCallable<undefined, unknown>(
    getFirebaseFunctions(),
    'getPresenceFriends',
  );
  const result = await getFriends();

  friends = parsePresenceFriends(result.data);
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

  const settings = await getPrivacySettings();

  if (!settings.sharePresence || !activeChannel) {
    await clearPublishedPresence();
    return;
  }

  const database = getFirebaseDatabase();
  const nextRecipients = new Set(friends.map((friend) => friend.id));

  await Promise.all(
    friends.map(async (friend) => {
      if (!identity || !activeChannel) {
        return;
      }

      const reference = ref(database, `presence/${friend.id}/${uid}`);
      const encrypted = await encryptPresence(identity, friend.encryptionKey, activeChannel);

      await onDisconnect(reference).remove();
      await set(reference, encrypted);
    }),
  );
  await Promise.all(
    [...publishedRecipients]
      .filter((recipientUid) => !nextRecipients.has(recipientUid))
      .map((recipientUid) => remove(ref(database, `presence/${recipientUid}/${uid}`))),
  );
  publishedRecipients = nextRecipients;
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
  try {
    await refreshFriends();
    listenForPresence();
    await queuePresencePublish();
  } catch (cause) {
    if (!(cause instanceof FirebaseError)) {
      throw cause;
    }
  }
}

export async function startPresenceSync(channel: TwitchChannel | null) {
  activeChannel = channel;
  uid = await ensureAnonymousAuth();
  identity = await getOrCreateLocalIdentity();

  await registerIdentity(identity);
  await refreshPresenceState();

  globalThis.setInterval(() => {
    void queuePresencePublish().catch(() => undefined);
  }, presencePublishInterval);
  globalThis.setInterval(() => {
    void refreshPresenceState().catch(() => undefined);
  }, presenceServiceRefreshInterval);
}

export function updatePresenceChannel(channel: TwitchChannel | null) {
  activeChannel = channel;
  void queuePresencePublish().catch(() => undefined);
}

export function refreshPresenceSharing() {
  void queuePresencePublish().catch(() => undefined);
}

export function refreshPresenceFriends() {
  void refreshPresenceState().catch(() => undefined);
}
