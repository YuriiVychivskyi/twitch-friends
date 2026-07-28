import { createHash, randomBytes } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type DocumentSnapshot,
} from 'firebase-admin/firestore';
import { defineJsonSecret } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';

import {
  getFriendState as loadFriendState,
  removeAllFriendConnections,
  removeFriendConnection,
  respondToFriendRequest as updateFriendRequest,
  sendFriendRequest,
} from './friends';
import { isTwitchUser, TwitchClient, type TwitchUser } from './twitchClient';

type TwitchApiConfig = {
  clientId: string;
  clientSecret: string;
  oauthRedirectUris?: string[];
};

type PublicIdentityKey = {
  crv: 'P-256';
  kty: 'EC';
  x: string;
  y: string;
};

const twitchApiConfig = defineJsonSecret<TwitchApiConfig>('TWITCH_API_CONFIG');

initializeApp();

const firestore = getFirestore();
let twitchClient: TwitchClient | null = null;
const callableCors = [
  'chrome-extension://nbgcpdcaeoihimognmdaknghgnelnifc',
  /^moz-extension:\/\/[a-f0-9-]+$/u,
];
const dailyFunctionLimit = 5_000;
const functionRuntime = {
  concurrency: 10,
  maxInstances: 2,
  memory: '256MiB' as const,
  region: 'europe-west1' as const,
  timeoutSeconds: 30,
};
const requestLimitWindowMilliseconds = 60 * 60 * 1_000;
const oauthStateLifetimeMilliseconds = 10 * 60 * 1_000;
const oauthStartCooldownMilliseconds = 10 * 1_000;
const presenceServiceLeaseMilliseconds = 60 * 60 * 1_000;
const requestWindows = new Map<string, { count: number; resetsAt: number }>();
let dailyUsageBlockedUntil = 0;
let presenceServiceEnabledUntil = 0;

function getDocumentValue(document: DocumentSnapshot, field: string): unknown {
  const data: unknown = document.data();

  if (!data || typeof data !== 'object') {
    return undefined;
  }

  return (data as Record<string, unknown>)[field];
}

function getRequestedLogin(data: unknown) {
  const requestedLogin =
    data && typeof data === 'object' ? (data as Record<string, unknown>).login : null;
  const login = typeof requestedLogin === 'string' ? requestedLogin.trim().toLowerCase() : '';

  if (!/^[a-z0-9_]{1,25}$/u.test(login)) {
    throw new HttpsError('invalid-argument', 'Enter a valid Twitch login.');
  }

  return login;
}

function getOAuthCallbackUri(data: unknown) {
  const input = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const callbackUri = typeof input.callbackUri === 'string' ? input.callbackUri.trim() : '';
  const allowedRedirectUris = twitchApiConfig.value().oauthRedirectUris ?? [];

  if (!allowedRedirectUris.includes(callbackUri)) {
    throw new HttpsError('permission-denied', 'Twitch callback URL is not allowed.');
  }

  return callbackUri;
}

function getConnectionId(data: unknown) {
  const input = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const connectionId = typeof input.connectionId === 'string' ? input.connectionId.trim() : '';

  if (!/^[a-z0-9_-]{1,128}$/iu.test(connectionId)) {
    throw new HttpsError('invalid-argument', 'Invalid friend connection.');
  }

  return connectionId;
}

function getPublicIdentityKey(data: unknown, field: string): PublicIdentityKey {
  const input = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const value = input[field];

  if (!value || typeof value !== 'object') {
    throw new HttpsError('invalid-argument', 'Public identity key is required.');
  }

  const key = value as Record<string, unknown>;

  if (
    key.crv !== 'P-256' ||
    key.kty !== 'EC' ||
    typeof key.x !== 'string' ||
    typeof key.y !== 'string' ||
    !/^[a-z0-9_-]{43}$/iu.test(key.x) ||
    !/^[a-z0-9_-]{43}$/iu.test(key.y)
  ) {
    throw new HttpsError('invalid-argument', 'Public identity key is invalid.');
  }

  return {
    crv: key.crv,
    kty: key.kty,
    x: key.x,
    y: key.y,
  };
}

function parseStoredPublicKey(value: unknown): PublicIdentityKey | null {
  try {
    return getPublicIdentityKey({ key: value }, 'key');
  } catch {
    return null;
  }
}

function hashOAuthState(state: string) {
  return createHash('sha256').update(state).digest('hex');
}

function getTwitchConfig() {
  const config = twitchApiConfig.value();

  if (!config.clientId || !config.clientSecret) {
    throw new HttpsError('failed-precondition', 'Twitch API is not configured.');
  }

  return config;
}

function getTwitchClient() {
  twitchClient ??= new TwitchClient(getTwitchConfig());

  return twitchClient;
}

async function saveTwitchProfile(uid: string, user: TwitchUser) {
  const ownerReference = firestore.collection('profileOwners').doc(user.login);
  const publicProfileReference = firestore.collection('publicProfiles').doc(user.login);
  const userProfileReference = firestore.collection('userProfiles').doc(uid);
  const ownerDocument = await ownerReference.get();
  const previousOwnerUid = getDocumentValue(ownerDocument, 'uid');

  if (typeof previousOwnerUid === 'string' && previousOwnerUid !== uid) {
    await removeAllFriendConnections(previousOwnerUid);
  }

  try {
    await firestore.runTransaction(async (transaction) => {
      const [currentOwnerDocument, userProfileDocument] = await Promise.all([
        transaction.get(ownerReference),
        transaction.get(userProfileReference),
      ]);
      const ownerUid = getDocumentValue(currentOwnerDocument, 'uid');
      const previousLogin = getDocumentValue(userProfileDocument, 'login');

      if (typeof ownerUid === 'string' && ownerUid !== uid) {
        if (ownerUid !== previousOwnerUid) {
          throw new HttpsError('aborted', 'Twitch profile ownership changed. Try again.');
        }

        transaction.delete(firestore.collection('userProfiles').doc(ownerUid));
      }

      if (typeof previousLogin === 'string' && previousLogin !== user.login) {
        transaction.delete(firestore.collection('profileOwners').doc(previousLogin));
        transaction.delete(firestore.collection('publicProfiles').doc(previousLogin));
      }

      transaction.set(ownerReference, {
        createdAt: currentOwnerDocument.exists
          ? getDocumentValue(currentOwnerDocument, 'createdAt')
          : FieldValue.serverTimestamp(),
        uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(publicProfileReference, {
        ...user,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(userProfileReference, {
        login: user.login,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (cause) {
    if (cause instanceof HttpsError) {
      throw cause;
    }

    throw new HttpsError('unavailable', 'Profile registration is temporarily unavailable.');
  }

  return user;
}

function createOAuthResultPage(success: boolean) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Twitch Friends</title>
    <style>
      body { margin: 0; background: #18181b; color: #efeff1; font: 16px system-ui, sans-serif; }
      main { max-width: 520px; margin: 15vh auto; padding: 32px; }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0; color: #adadb8; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <h1>${success ? 'Twitch connected' : 'Connection failed'}</h1>
      <p>${
        success
          ? 'Your Twitch account was verified. You can close this tab and reopen the extension.'
          : 'The authorization could not be completed. Close this tab and try again from the extension.'
      }</p>
    </main>
  </body>
</html>`;
}

function getNextUtcDay(now: number) {
  const date = new Date(now);

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function enforceMemoryRateLimit(key: string, limit: number, windowMilliseconds: number) {
  const now = Date.now();
  const existing = requestWindows.get(key);

  if (!existing || existing.resetsAt <= now) {
    requestWindows.set(key, {
      count: 1,
      resetsAt: now + windowMilliseconds,
    });
  } else {
    if (existing.count >= limit) {
      throw new HttpsError('resource-exhausted', 'Request limit reached.');
    }

    existing.count += 1;
  }

  if (requestWindows.size > 5_000) {
    for (const [storedKey, window] of requestWindows) {
      if (window.resetsAt <= now) {
        requestWindows.delete(storedKey);
      }
    }
  }
}

async function enforceDailyFunctionLimit() {
  const nowMilliseconds = Date.now();

  if (dailyUsageBlockedUntil > nowMilliseconds) {
    throw new HttpsError('resource-exhausted', 'Daily service limit reached.');
  }

  const now = Timestamp.fromMillis(nowMilliseconds);
  const day = new Date(nowMilliseconds).toISOString().slice(0, 10);
  const nextDay = getNextUtcDay(nowMilliseconds);
  const reference = firestore.collection('functionDailyUsage').doc(day);

  try {
    await firestore.runTransaction(async (transaction) => {
      const document = await transaction.get(reference);
      const storedCount = getDocumentValue(document, 'count');
      const count = typeof storedCount === 'number' ? storedCount : 0;

      if (getDocumentValue(document, 'disabled') === true || count >= dailyFunctionLimit) {
        dailyUsageBlockedUntil = nextDay;
        throw new HttpsError('resource-exhausted', 'Daily service limit reached.');
      }

      transaction.set(
        reference,
        {
          count: count + 1,
          expiresAt: Timestamp.fromMillis(nextDay + 7 * 24 * 60 * 60 * 1_000),
          updatedAt: now,
        },
        {
          merge: true,
        },
      );
    });
  } catch (cause) {
    if (cause instanceof HttpsError) {
      await getDatabase().ref('service/enabledUntil').set(nowMilliseconds);
      presenceServiceEnabledUntil = nowMilliseconds;
      throw cause;
    }

    throw new HttpsError('unavailable', 'Request protection is temporarily unavailable.');
  }

  if (presenceServiceEnabledUntil < nowMilliseconds + presenceServiceLeaseMilliseconds / 2) {
    presenceServiceEnabledUntil = nowMilliseconds + presenceServiceLeaseMilliseconds;
    await getDatabase().ref('service/enabledUntil').set(presenceServiceEnabledUntil);
  }
}

async function enforceRequestLimits(
  operation: string,
  uid: string,
  ip: string | undefined,
  userLimit: number,
  ipLimit: number,
) {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);

  enforceMemoryRateLimit(`instance:${day}`, dailyFunctionLimit, getNextUtcDay(now) - now);
  enforceMemoryRateLimit(`${operation}:uid:${uid}`, userLimit, requestLimitWindowMilliseconds);
  enforceMemoryRateLimit(
    `${operation}:ip:${ip ?? 'unknown'}`,
    ipLimit,
    requestLimitWindowMilliseconds,
  );

  await enforceDailyFunctionLimit();
}

export const createFriendRequest = onCall(
  {
    ...functionRuntime,
    cors: callableCors,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    await enforceRequestLimits('friend-mutation', request.auth.uid, request.rawRequest.ip, 10, 30);
    await sendFriendRequest(request.auth.uid, getRequestedLogin(request.data));

    return {
      success: true,
    };
  },
);

export const getFriends = onCall(
  {
    ...functionRuntime,
    cors: callableCors,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    await enforceRequestLimits('friend-read', request.auth.uid, request.rawRequest.ip, 60, 120);

    return loadFriendState(request.auth.uid);
  },
);

export const registerPublicIdentity = onCall(
  {
    ...functionRuntime,
    cors: callableCors,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    await enforceRequestLimits('identity', request.auth.uid, request.rawRequest.ip, 10, 30);

    await firestore
      .collection('publicIdentityKeys')
      .doc(request.auth.uid)
      .set({
        encryptionKey: getPublicIdentityKey(request.data, 'encryptionKey'),
        updatedAt: FieldValue.serverTimestamp(),
      });

    return {
      success: true,
    };
  },
);

export const getPresenceFriends = onCall(
  {
    ...functionRuntime,
    cors: callableCors,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    await enforceRequestLimits('presence-friends', request.auth.uid, request.rawRequest.ip, 30, 90);

    const state = await loadFriendState(request.auth.uid);
    const friends = await Promise.all(
      state.friends.map(async (friend) => {
        const identity = await firestore.collection('publicIdentityKeys').doc(friend.id).get();
        const encryptionKey = parseStoredPublicKey(getDocumentValue(identity, 'encryptionKey'));

        return encryptionKey
          ? {
              encryptionKey,
              id: friend.id,
              profile: friend.profile,
            }
          : null;
      }),
    );

    return friends.filter((friend) => friend !== null);
  },
);

export const respondToFriendRequest = onCall(
  {
    ...functionRuntime,
    cors: callableCors,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const input =
      request.data && typeof request.data === 'object'
        ? (request.data as Record<string, unknown>)
        : {};

    if (typeof input.accept !== 'boolean') {
      throw new HttpsError('invalid-argument', 'Friend request response is required.');
    }

    await enforceRequestLimits('friend-mutation', request.auth.uid, request.rawRequest.ip, 10, 30);
    await updateFriendRequest(request.auth.uid, getConnectionId(request.data), input.accept);

    return {
      success: true,
    };
  },
);

export const removeFriend = onCall(
  {
    ...functionRuntime,
    cors: callableCors,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    await enforceRequestLimits('friend-mutation', request.auth.uid, request.rawRequest.ip, 10, 30);
    await removeFriendConnection(request.auth.uid, getConnectionId(request.data));

    return {
      success: true,
    };
  },
);

export const startTwitchAuthorization = onCall(
  {
    ...functionRuntime,
    cors: callableCors,
    secrets: [twitchApiConfig],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const uid = request.auth.uid;
    const callbackUri = getOAuthCallbackUri(request.data);

    await enforceRequestLimits('oauth-start', request.auth.uid, request.rawRequest.ip, 6, 20);

    const now = Timestamp.now();
    const startReference = firestore.collection('oauthStarts').doc(uid);
    const state = randomBytes(32).toString('hex');
    const stateHash = hashOAuthState(state);
    const stateReference = firestore.collection('oauthStates').doc(stateHash);

    await firestore.runTransaction(async (transaction) => {
      const startDocument = await transaction.get(startReference);
      const previousStart = getDocumentValue(startDocument, 'createdAt');
      const previousStateHash = getDocumentValue(startDocument, 'stateHash');

      if (
        previousStart instanceof Timestamp &&
        now.toMillis() - previousStart.toMillis() < oauthStartCooldownMilliseconds
      ) {
        throw new HttpsError('resource-exhausted', 'Wait before starting authorization again.');
      }

      if (typeof previousStateHash === 'string') {
        transaction.delete(firestore.collection('oauthStates').doc(previousStateHash));
      }

      transaction.set(startReference, {
        createdAt: now,
        stateHash,
      });
      transaction.set(stateReference, {
        callbackUri,
        createdAt: now,
        expiresAt: Timestamp.fromMillis(now.toMillis() + oauthStateLifetimeMilliseconds),
        uid,
      });
    });

    const authorizationUrl = new URL('https://id.twitch.tv/oauth2/authorize');

    authorizationUrl.searchParams.set('client_id', getTwitchConfig().clientId);
    authorizationUrl.searchParams.set('force_verify', 'true');
    authorizationUrl.searchParams.set('redirect_uri', callbackUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid');
    authorizationUrl.searchParams.set('state', state);

    return {
      authorizationUrl: authorizationUrl.toString(),
    };
  },
);

export const twitchOAuthCallback = onRequest(
  {
    ...functionRuntime,
    secrets: [twitchApiConfig],
  },
  async (request, response) => {
    const sendResult = (success: boolean) => {
      response
        .status(success ? 200 : 400)
        .set('Cache-Control', 'no-store')
        .set(
          'Content-Security-Policy',
          "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'",
        )
        .set('Cross-Origin-Opener-Policy', 'same-origin')
        .set('Content-Type', 'text/html; charset=utf-8')
        .set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        .set('Referrer-Policy', 'no-referrer')
        .set('X-Content-Type-Options', 'nosniff')
        .set('X-Frame-Options', 'DENY')
        .send(createOAuthResultPage(success));
    };

    if (request.method !== 'GET') {
      response
        .status(405)
        .set('Allow', 'GET')
        .set('Cache-Control', 'no-store')
        .set('Content-Type', 'text/plain; charset=utf-8')
        .send('Method Not Allowed');
      return;
    }

    const code = typeof request.query.code === 'string' ? request.query.code.trim() : '';
    const state = typeof request.query.state === 'string' ? request.query.state.trim() : '';

    if (!/^[a-f0-9]{64}$/u.test(state)) {
      sendResult(false);
      return;
    }

    const stateReference = firestore.collection('oauthStates').doc(hashOAuthState(state));
    const oauthState = await firestore.runTransaction(async (transaction) => {
      const stateDocument = await transaction.get(stateReference);

      if (!stateDocument.exists) {
        return null;
      }

      transaction.delete(stateReference);

      return {
        callbackUri: getDocumentValue(stateDocument, 'callbackUri'),
        expiresAt: getDocumentValue(stateDocument, 'expiresAt'),
        uid: getDocumentValue(stateDocument, 'uid'),
      };
    });

    if (!oauthState || !/^[a-z0-9._~-]{1,512}$/iu.test(code)) {
      sendResult(false);
      return;
    }

    const { callbackUri, expiresAt, uid } = oauthState;

    if (
      typeof callbackUri !== 'string' ||
      typeof uid !== 'string' ||
      !(expiresAt instanceof Timestamp) ||
      expiresAt.toMillis() <= Date.now() ||
      !(twitchApiConfig.value().oauthRedirectUris ?? []).includes(callbackUri)
    ) {
      sendResult(false);
      return;
    }

    const client = getTwitchClient();
    let accessToken = '';
    let refreshToken = '';

    try {
      const tokens = await client.exchangeAuthorizationCode(code, callbackUri);

      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;

      const identity = await client.validateUserAccessToken(accessToken);
      const config = getTwitchConfig();

      if (identity.clientId !== config.clientId) {
        throw new Error('Twitch token belongs to another application.');
      }

      const user = await client.getUser(identity.login);

      if (!user || user.id !== identity.userId) {
        throw new Error('Twitch account ownership could not be verified.');
      }

      await saveTwitchProfile(uid, user);
      sendResult(true);
    } catch {
      sendResult(false);
    } finally {
      await Promise.allSettled(
        [accessToken, refreshToken].filter(Boolean).map((token) => client.revokeToken(token)),
      );
    }
  },
);

export const getMyTwitchProfile = onCall(
  {
    ...functionRuntime,
    cors: callableCors,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    await enforceRequestLimits('profile-read', request.auth.uid, request.rawRequest.ip, 60, 120);

    const userProfile = await firestore.collection('userProfiles').doc(request.auth.uid).get();
    const login = getDocumentValue(userProfile, 'login');

    if (typeof login !== 'string') {
      return null;
    }

    const publicProfile = await firestore.collection('publicProfiles').doc(login).get();
    const profile = publicProfile.data();

    if (!isTwitchUser(profile)) {
      throw new HttpsError('data-loss', 'Stored Twitch profile is invalid.');
    }

    return {
      avatarUrl: profile.avatarUrl,
      displayName: profile.displayName,
      id: profile.id,
      login: profile.login,
    };
  },
);
