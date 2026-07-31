import { ApiError } from './errors';
import type { Env } from './types';

type FirebaseAdminConfig = {
  clientEmail: string;
  databaseUrl: string;
  privateKey: string;
};

type FriendshipEdge = {
  userAUid: string;
  userBUid: string;
};

type AccessToken = {
  clientEmail: string;
  expiresAt: number;
  value: string;
};

const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const tokenScope =
  'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';
let cachedAccessToken: AccessToken | null = null;

function base64Url(value: ArrayBuffer | Uint8Array | string) {
  const bytes =
    typeof value === 'string'
      ? new TextEncoder().encode(value)
      : value instanceof Uint8Array
        ? value
        : new Uint8Array(value);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function parsePrivateKey(value: string) {
  const match = value.match(
    /^-----BEGIN PRIVATE KEY-----\s+([A-Za-z0-9+/=\s]+)\s+-----END PRIVATE KEY-----$/u,
  );

  if (!match?.[1]) {
    throw new ApiError(503, 'unavailable', 'Firebase admin configuration is invalid.');
  }

  const binary = atob(match[1].replaceAll(/\s/gu, ''));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function validateDatabaseUrl(value: unknown, projectId: string, allowEmulator: boolean) {
  if (typeof value !== 'string') {
    throw new ApiError(503, 'unavailable', 'Firebase admin configuration is invalid.');
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new ApiError(503, 'unavailable', 'Firebase admin configuration is invalid.');
  }

  const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
  const validProductionHost =
    (url.hostname.endsWith('.firebaseio.com') || url.hostname.endsWith('.firebasedatabase.app')) &&
    (url.hostname === `${projectId}.firebaseio.com` || url.hostname.startsWith(`${projectId}-`));

  if (
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== '/' ||
    (local ? !allowEmulator || url.protocol !== 'http:' : url.protocol !== 'https:') ||
    (!local && (!validProductionHost || url.search))
  ) {
    throw new ApiError(503, 'unavailable', 'Firebase admin configuration is invalid.');
  }

  return url;
}

function getAdminConfig(env: Env) {
  const allowEmulator =
    env.ALLOW_INSECURE_EMULATOR_AUTH === 'true' && env.FIREBASE_PROJECT_ID.startsWith('demo-');

  if (!env.FIREBASE_ADMIN_CONFIG && allowEmulator) {
    return {
      clientEmail: '',
      databaseUrl: new URL(
        `http://127.0.0.1:9000/?ns=${encodeURIComponent(env.FIREBASE_PROJECT_ID)}`,
      ),
      privateKey: '',
    };
  }

  let input: Partial<FirebaseAdminConfig>;

  try {
    input = JSON.parse(env.FIREBASE_ADMIN_CONFIG ?? '') as Partial<FirebaseAdminConfig>;
  } catch {
    throw new ApiError(503, 'unavailable', 'Firebase admin configuration is invalid.');
  }

  if (
    typeof input.clientEmail !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/u.test(input.clientEmail) ||
    typeof input.privateKey !== 'string'
  ) {
    throw new ApiError(503, 'unavailable', 'Firebase admin configuration is invalid.');
  }

  return {
    clientEmail: input.clientEmail,
    databaseUrl: validateDatabaseUrl(input.databaseUrl, env.FIREBASE_PROJECT_ID, allowEmulator),
    privateKey: input.privateKey,
  };
}

async function createAccessToken(config: ReturnType<typeof getAdminConfig>) {
  if (!config.clientEmail || !config.privateKey) {
    return '';
  }

  if (
    cachedAccessToken?.clientEmail === config.clientEmail &&
    cachedAccessToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedAccessToken.value;
  }

  const issuedAt = Math.floor(Date.now() / 1_000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      aud: tokenEndpoint,
      exp: issuedAt + 3_600,
      iat: issuedAt,
      iss: config.clientEmail,
      scope: tokenScope,
    }),
  );
  const unsignedToken = `${header}.${claims}`;
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    parsePrivateKey(config.privateKey),
    { hash: 'SHA-256', name: 'RSASSA-PKCS1-v1_5' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(unsignedToken),
  );
  const response = await fetch(tokenEndpoint, {
    body: new URLSearchParams({
      assertion: `${unsignedToken}.${base64Url(signature)}`,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new ApiError(503, 'unavailable', 'Firebase administration is unavailable.');
  }

  const body: unknown = await response.json();

  if (!body || typeof body !== 'object') {
    throw new ApiError(503, 'unavailable', 'Firebase administration is unavailable.');
  }

  const result = body as Record<string, unknown>;

  if (
    typeof result.access_token !== 'string' ||
    result.access_token.length < 20 ||
    typeof result.expires_in !== 'number'
  ) {
    throw new ApiError(503, 'unavailable', 'Firebase administration is unavailable.');
  }

  cachedAccessToken = {
    clientEmail: config.clientEmail,
    expiresAt: Date.now() + Math.min(result.expires_in, 3_600) * 1_000,
    value: result.access_token,
  };

  return cachedAccessToken.value;
}

function buildFriendshipNodes(edges: FriendshipEdge[], targetUids?: Set<string>) {
  const nodes: Record<string, Record<string, true> | null> = {};

  if (targetUids) {
    for (const uid of targetUids) {
      nodes[uid] = null;
    }
  }

  for (const edge of edges) {
    if (!targetUids || targetUids.has(edge.userAUid)) {
      (nodes[edge.userAUid] ??= {})[edge.userBUid] = true;
    }

    if (!targetUids || targetUids.has(edge.userBUid)) {
      (nodes[edge.userBUid] ??= {})[edge.userAUid] = true;
    }
  }

  return nodes;
}

async function writeFriendshipNodes(
  env: Env,
  method: 'PATCH' | 'PUT',
  nodes: Record<string, Record<string, true> | null>,
) {
  const config = getAdminConfig(env);
  const url = new URL('friendships.json', config.databaseUrl);

  for (const [name, value] of config.databaseUrl.searchParams) {
    url.searchParams.set(name, value);
  }

  const accessToken = await createAccessToken(config);
  const response = await fetch(url, {
    body: JSON.stringify(nodes),
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    method,
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new ApiError(503, 'unavailable', 'Firebase friendship synchronization failed.');
  }
}

export async function syncFriendshipNodes(
  env: Env,
  edges: FriendshipEdge[],
  affectedUids: string[],
) {
  const targets = new Set(affectedUids.filter(Boolean));

  if (targets.size === 0) {
    return;
  }

  await writeFriendshipNodes(env, 'PATCH', buildFriendshipNodes(edges, targets));
}

export async function replaceFriendshipGraph(env: Env, edges: FriendshipEdge[]) {
  await writeFriendshipNodes(env, 'PUT', buildFriendshipNodes(edges));
}
