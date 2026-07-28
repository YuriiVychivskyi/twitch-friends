import { ApiError } from './errors';
import { verifyFirebaseIdentity } from './firebaseAuth';
import {
  errorResponse,
  getAllowedOrigins,
  getAllowedRequestOrigin,
  json,
  readJson,
  requireAllowedOrigin,
  withCors,
} from './http';
import { enforcePublicCallbackLimit, enforceRequestLimits } from './rateLimit';
import {
  cleanupExpiredData,
  connectTwitchProfile,
  consumeOAuthState,
  createOAuthState,
  getFriendState,
  getPresenceFriends,
  getProfileByFirebaseUid,
  removeAccount,
  removeFriendConnection,
  respondToFriendRequest,
  saveIdentityKey,
  sendFriendRequest,
} from './repository';
import { TwitchClient } from './twitch';
import type { Env } from './types';
import { normalizeLogin, validateConnectionId, validatePublicIdentityKey } from './validation';

const oauthStateLifetime = 10 * 60 * 1_000;

function getClientIp(request: Request) {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown';
}

function randomHex(bytes: number) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));

  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validateEnvironment(env: Env) {
  if (
    !env.FIREBASE_PROJECT_ID ||
    !env.TWITCH_CLIENT_ID ||
    !env.TWITCH_CLIENT_SECRET ||
    getAllowedOrigins(env).size === 0
  ) {
    throw new ApiError(503, 'unavailable', 'Backend configuration is incomplete.');
  }

  try {
    const callback = new URL(env.TWITCH_OAUTH_CALLBACK_URL);
    const local =
      callback.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(callback.hostname);

    if (
      (!local && callback.protocol !== 'https:') ||
      callback.username ||
      callback.password ||
      callback.search ||
      callback.hash
    ) {
      throw new Error('Invalid callback URL.');
    }
  } catch {
    throw new ApiError(503, 'unavailable', 'Backend OAuth configuration is invalid.');
  }
}

function oauthResultPage(success: boolean) {
  const title = success ? 'Twitch connected' : 'Connection failed';
  const message = success
    ? 'Your Twitch account was verified. You can close this tab and reopen the extension.'
    : 'The authorization could not be completed. Close this tab and try again from the extension.';

  return new Response(
    `<!doctype html>
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
      <h1>${title}</h1>
      <p>${message}</p>
    </main>
  </body>
</html>`,
    {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'",
        'Content-Type': 'text/html; charset=utf-8',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      },
      status: success ? 200 : 400,
    },
  );
}

async function startTwitchAuthorization(request: Request, env: Env, uid: string) {
  await enforceRequestLimits(env.DB, 'oauth-start', uid, getClientIp(request), 6, 20);

  const now = Date.now();
  const state = randomHex(32);
  const stateHash = await sha256(state);

  await createOAuthState(env.DB, uid, stateHash, now, now + oauthStateLifetime);

  const authorizationUrl = new URL('https://id.twitch.tv/oauth2/authorize');

  authorizationUrl.searchParams.set('client_id', env.TWITCH_CLIENT_ID);
  authorizationUrl.searchParams.set('force_verify', 'true');
  authorizationUrl.searchParams.set('redirect_uri', env.TWITCH_OAUTH_CALLBACK_URL);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', 'openid');
  authorizationUrl.searchParams.set('state', state);

  return json({
    authorizationUrl: authorizationUrl.toString(),
  });
}

async function handleOAuthCallback(request: Request, env: Env) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', {
      headers: {
        Allow: 'GET',
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
      status: 405,
    });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code')?.trim() ?? '';
  const state = url.searchParams.get('state')?.trim() ?? '';

  if (!/^[a-f0-9]{64}$/u.test(state) || !/^[a-z0-9._~-]{1,512}$/iu.test(code)) {
    return oauthResultPage(false);
  }

  await enforcePublicCallbackLimit(env.DB, getClientIp(request));

  const oauthState = await consumeOAuthState(env.DB, await sha256(state));

  if (!oauthState || oauthState.expires_at <= Date.now()) {
    return oauthResultPage(false);
  }

  const twitch = new TwitchClient({
    clientId: env.TWITCH_CLIENT_ID,
    clientSecret: env.TWITCH_CLIENT_SECRET,
  });
  let accessToken = '';
  let refreshToken = '';

  try {
    const tokens = await twitch.exchangeAuthorizationCode(code, env.TWITCH_OAUTH_CALLBACK_URL);

    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;

    const identity = await twitch.validateUserAccessToken(accessToken);

    if (identity.clientId !== env.TWITCH_CLIENT_ID) {
      throw new ApiError(400, 'oauth-failed', 'Twitch token belongs to another application.');
    }

    const profile = await twitch.getUser(identity.login);

    if (!profile || profile.id !== identity.userId) {
      throw new ApiError(400, 'oauth-failed', 'Twitch account ownership could not be verified.');
    }

    await connectTwitchProfile(env.DB, oauthState.firebase_uid, profile);

    return oauthResultPage(true);
  } catch {
    return oauthResultPage(false);
  } finally {
    await Promise.allSettled(
      [accessToken, refreshToken].filter(Boolean).map((token) => twitch.revokeToken(token)),
    );
  }
}

async function handleApiRequest(request: Request, env: Env) {
  const identity = await verifyFirebaseIdentity(request, env);
  const url = new URL(request.url);
  const path = url.pathname;
  const ip = getClientIp(request);

  if (path === '/api/oauth/start' && request.method === 'POST') {
    return startTwitchAuthorization(request, env, identity.uid);
  }

  if (path === '/api/profile' && request.method === 'GET') {
    await enforceRequestLimits(env.DB, 'profile-read', identity.uid, ip, 60, 120);
    return json(await getProfileByFirebaseUid(env.DB, identity.uid));
  }

  if (path === '/api/friends' && request.method === 'GET') {
    await enforceRequestLimits(env.DB, 'friend-read', identity.uid, ip, 60, 120);
    return json(await getFriendState(env.DB, identity.uid));
  }

  if (path === '/api/friends/requests' && request.method === 'POST') {
    await enforceRequestLimits(env.DB, 'friend-mutation', identity.uid, ip, 10, 30);

    const body = await readJson(request);
    const login = normalizeLogin(
      body && typeof body === 'object' ? (body as Record<string, unknown>).login : null,
    );

    await sendFriendRequest(env.DB, identity.uid, login);
    return json({ success: true });
  }

  if (path === '/api/friends/respond' && request.method === 'POST') {
    await enforceRequestLimits(env.DB, 'friend-mutation', identity.uid, ip, 10, 30);

    const body = await readJson(request);
    const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

    if (typeof input.accept !== 'boolean') {
      throw new ApiError(400, 'invalid-argument', 'Friend request response is required.');
    }

    await respondToFriendRequest(
      env.DB,
      identity.uid,
      validateConnectionId(input.connectionId),
      input.accept,
    );
    return json({ success: true });
  }

  if (path.startsWith('/api/friends/') && request.method === 'DELETE') {
    await enforceRequestLimits(env.DB, 'friend-mutation', identity.uid, ip, 10, 30);

    const connectionId = validateConnectionId(
      decodeURIComponent(path.slice('/api/friends/'.length)),
    );

    await removeFriendConnection(env.DB, identity.uid, connectionId);
    return json({ success: true });
  }

  if (path === '/api/identity' && request.method === 'PUT') {
    await enforceRequestLimits(env.DB, 'identity', identity.uid, ip, 10, 30);

    const body = await readJson(request);
    const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

    await saveIdentityKey(env.DB, identity.uid, validatePublicIdentityKey(input.encryptionKey));
    return json({ success: true });
  }

  if (path === '/api/presence-friends' && request.method === 'GET') {
    await enforceRequestLimits(env.DB, 'presence-friends', identity.uid, ip, 30, 90);
    return json(await getPresenceFriends(env.DB, identity.uid));
  }

  if (path === '/api/account/disconnect' && request.method === 'POST') {
    await enforceRequestLimits(env.DB, 'account-mutation', identity.uid, ip, 3, 10);
    const friendIds = await removeAccount(env.DB, identity.uid);
    return json({ friendIds, success: true });
  }

  if (path === '/api/account' && request.method === 'DELETE') {
    await enforceRequestLimits(env.DB, 'account-mutation', identity.uid, ip, 3, 10);
    const friendIds = await removeAccount(env.DB, identity.uid);
    return json({ friendIds, success: true });
  }

  throw new ApiError(404, 'not-found', 'Backend route was not found.');
}

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await cleanupExpiredData(env.DB, Date.now());
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      validateEnvironment(env);

      const url = new URL(request.url);

      if (url.pathname === '/oauth/callback') {
        return await handleOAuthCallback(request, env);
      }

      if (!url.pathname.startsWith('/api/')) {
        return new Response('Not Found', {
          headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'text/plain; charset=utf-8',
          },
          status: 404,
        });
      }

      const origin = requireAllowedOrigin(request, env);

      if (request.method === 'OPTIONS') {
        return withCors(new Response(null, { status: 204 }), origin);
      }

      return withCors(await handleApiRequest(request, env), origin);
    } catch (cause) {
      const origin = getAllowedRequestOrigin(request, env);
      const response = errorResponse(cause);

      return origin ? withCors(response, origin) : response;
    }
  },
} satisfies ExportedHandler<Env>;
