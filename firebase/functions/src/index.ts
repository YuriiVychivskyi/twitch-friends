import { createHash, randomBytes } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type DocumentSnapshot,
} from 'firebase-admin/firestore';
import { defineJsonSecret } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';

import { TwitchClient, type TwitchUser } from './twitchClient';

type TwitchApiConfig = {
  clientId: string;
  clientSecret: string;
  oauthRedirectUris?: string[];
};

const twitchApiConfig = defineJsonSecret<TwitchApiConfig>('TWITCH_API_CONFIG');

initializeApp();

const firestore = getFirestore();
let twitchClient: TwitchClient | null = null;
const lookupLimit = 30;
const lookupWindowMilliseconds = 60 * 1_000;
const oauthStateLifetimeMilliseconds = 10 * 60 * 1_000;
const oauthStartCooldownMilliseconds = 10 * 1_000;

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

async function getTwitchUser(login: string) {
  try {
    return await getTwitchClient().getUser(login);
  } catch (cause) {
    if (cause instanceof HttpsError) {
      throw cause;
    }

    throw new HttpsError('unavailable', 'Twitch API is temporarily unavailable.');
  }
}

async function saveTwitchProfile(uid: string, user: TwitchUser) {
  const ownerReference = firestore.collection('profileOwners').doc(user.login);
  const publicProfileReference = firestore.collection('publicProfiles').doc(user.login);
  const userProfileReference = firestore.collection('userProfiles').doc(uid);

  try {
    await firestore.runTransaction(async (transaction) => {
      const [ownerDocument, userProfileDocument] = await Promise.all([
        transaction.get(ownerReference),
        transaction.get(userProfileReference),
      ]);
      const ownerUid = getDocumentValue(ownerDocument, 'uid');
      const previousLogin = getDocumentValue(userProfileDocument, 'login');

      if (typeof ownerUid === 'string' && ownerUid !== uid) {
        transaction.delete(firestore.collection('userProfiles').doc(ownerUid));
      }

      if (typeof previousLogin === 'string' && previousLogin !== user.login) {
        transaction.delete(firestore.collection('profileOwners').doc(previousLogin));
        transaction.delete(firestore.collection('publicProfiles').doc(previousLogin));
      }

      transaction.set(ownerReference, {
        createdAt: ownerDocument.exists
          ? getDocumentValue(ownerDocument, 'createdAt')
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

async function enforceLookupLimit(uid: string) {
  const reference = firestore.collection('functionRateLimits').doc(`twitchLookup_${uid}`);
  const now = Timestamp.now();

  await firestore.runTransaction(async (transaction) => {
    const document = await transaction.get(reference);
    const storedCount = getDocumentValue(document, 'count');
    const storedWindowStart = getDocumentValue(document, 'windowStartedAt');
    const windowActive =
      storedWindowStart instanceof Timestamp &&
      now.toMillis() - storedWindowStart.toMillis() < lookupWindowMilliseconds;
    const count = windowActive && typeof storedCount === 'number' ? storedCount : 0;

    if (count >= lookupLimit) {
      throw new HttpsError('resource-exhausted', 'Twitch lookup limit reached.');
    }

    transaction.set(reference, {
      count: count + 1,
      windowStartedAt: windowActive ? storedWindowStart : now,
    });
  });
}

export const lookupTwitchUser = onCall(
  {
    region: 'europe-west1',
    secrets: [twitchApiConfig],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    await enforceLookupLimit(request.auth.uid);

    return getTwitchUser(getRequestedLogin(request.data));
  },
);

export const startTwitchAuthorization = onCall(
  {
    region: 'europe-west1',
    secrets: [twitchApiConfig],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const uid = request.auth.uid;
    const callbackUri = getOAuthCallbackUri(request.data);
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
    region: 'europe-west1',
    secrets: [twitchApiConfig],
  },
  async (request, response) => {
    const sendResult = (success: boolean) => {
      response
        .status(success ? 200 : 400)
        .set('Cache-Control', 'no-store')
        .set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
        .set('Content-Type', 'text/html; charset=utf-8')
        .set('Referrer-Policy', 'no-referrer')
        .set('X-Content-Type-Options', 'nosniff')
        .send(createOAuthResultPage(success));
    };
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
    region: 'europe-west1',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const userProfile = await firestore.collection('userProfiles').doc(request.auth.uid).get();
    const login = getDocumentValue(userProfile, 'login');

    if (typeof login !== 'string') {
      return null;
    }

    const publicProfile = await firestore.collection('publicProfiles').doc(login).get();

    if (!publicProfile.exists) {
      return null;
    }

    const avatarUrl = getDocumentValue(publicProfile, 'avatarUrl');
    const displayName = getDocumentValue(publicProfile, 'displayName');
    const id = getDocumentValue(publicProfile, 'id');
    const publicLogin = getDocumentValue(publicProfile, 'login');

    if (
      typeof avatarUrl !== 'string' ||
      typeof displayName !== 'string' ||
      typeof id !== 'string' ||
      typeof publicLogin !== 'string'
    ) {
      throw new HttpsError('data-loss', 'Stored Twitch profile is invalid.');
    }

    return {
      avatarUrl,
      displayName,
      id,
      login: publicLogin,
    };
  },
);
