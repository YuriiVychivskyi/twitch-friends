import { ApiError } from './errors';
import type { Env, FirebaseIdentity } from './types';

type JwtHeader = {
  alg?: unknown;
  kid?: unknown;
};

type JwtPayload = {
  aud?: unknown;
  auth_time?: unknown;
  exp?: unknown;
  firebase?: unknown;
  iat?: unknown;
  iss?: unknown;
  sub?: unknown;
};

type JsonWebKeySet = {
  keys?: unknown;
};

type FirebaseJsonWebKey = JsonWebKey & {
  kid?: unknown;
};

let cachedKeys = new Map<string, CryptoKey>();
let keysExpireAt = 0;

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function decodeJson<T>(value: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
  } catch {
    throw new ApiError(401, 'unauthenticated', 'Firebase token is invalid.');
  }
}

function getMaxAge(value: string | null) {
  const match = value?.match(/(?:^|,)\s*max-age=(\d+)/iu);

  return match ? Number(match[1]) : 3_600;
}

async function loadVerificationKeys(forceRefresh = false) {
  if (!forceRefresh && cachedKeys.size > 0 && Date.now() < keysExpireAt) {
    return cachedKeys;
  }

  const response = await fetch(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
    {
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new ApiError(503, 'unavailable', 'Firebase authentication is unavailable.');
  }

  const responseValue: unknown = await response.json();
  const value =
    responseValue && typeof responseValue === 'object' ? (responseValue as JsonWebKeySet) : {};
  const keys = Array.isArray(value.keys) ? value.keys : [];
  const importedKeys = new Map<string, CryptoKey>();

  for (const item of keys) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const jwk = item as FirebaseJsonWebKey;

    if (typeof jwk.kid !== 'string' || jwk.kty !== 'RSA') {
      continue;
    }

    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      {
        hash: 'SHA-256',
        name: 'RSASSA-PKCS1-v1_5',
      },
      false,
      ['verify'],
    );

    importedKeys.set(jwk.kid, key);
  }

  if (importedKeys.size === 0) {
    throw new ApiError(503, 'unavailable', 'Firebase authentication is unavailable.');
  }

  cachedKeys = importedKeys;
  keysExpireAt = Date.now() + getMaxAge(response.headers.get('Cache-Control')) * 1_000;

  return cachedKeys;
}

function validateClaims(payload: JwtPayload, projectId: string) {
  const now = Math.floor(Date.now() / 1_000);
  const firebase = payload.firebase;
  const provider =
    firebase && typeof firebase === 'object'
      ? (firebase as Record<string, unknown>).sign_in_provider
      : null;

  if (
    payload.aud !== projectId ||
    payload.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof payload.sub !== 'string' ||
    payload.sub.length < 1 ||
    payload.sub.length > 128 ||
    typeof payload.exp !== 'number' ||
    payload.exp <= now ||
    typeof payload.iat !== 'number' ||
    payload.iat > now + 60 ||
    typeof payload.auth_time !== 'number' ||
    payload.auth_time > now + 60 ||
    provider !== 'anonymous'
  ) {
    throw new ApiError(401, 'unauthenticated', 'Firebase token is invalid.');
  }

  return {
    uid: payload.sub,
  };
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer ([A-Za-z0-9._~-]{20,8192})$/u);

  if (!match) {
    throw new ApiError(401, 'unauthenticated', 'Authentication is required.');
  }

  return match[1] ?? '';
}

export async function verifyFirebaseIdentity(
  request: Request,
  env: Env,
): Promise<FirebaseIdentity> {
  const token = getBearerToken(request);
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new ApiError(401, 'unauthenticated', 'Firebase token is invalid.');
  }

  const [encodedHeader = '', encodedPayload = '', encodedSignature = ''] = parts;
  const header = decodeJson<JwtHeader>(encodedHeader);
  const payload = decodeJson<JwtPayload>(encodedPayload);

  if (env.ALLOW_INSECURE_EMULATOR_AUTH === 'true' && header.alg === 'none') {
    if (!env.FIREBASE_PROJECT_ID.startsWith('demo-') || encodedSignature.length !== 0) {
      throw new ApiError(401, 'unauthenticated', 'Firebase emulator token is invalid.');
    }

    return validateClaims(payload, env.FIREBASE_PROJECT_ID);
  }

  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !encodedSignature) {
    throw new ApiError(401, 'unauthenticated', 'Firebase token is invalid.');
  }

  let keys = await loadVerificationKeys();
  let key = keys.get(header.kid);

  if (!key) {
    keys = await loadVerificationKeys(true);
    key = keys.get(header.kid);
  }

  if (!key) {
    throw new ApiError(401, 'unauthenticated', 'Firebase token key is unknown.');
  }

  const verified = await crypto.subtle.verify(
    {
      name: 'RSASSA-PKCS1-v1_5',
    },
    key,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );

  if (!verified) {
    throw new ApiError(401, 'unauthenticated', 'Firebase token signature is invalid.');
  }

  return validateClaims(payload, env.FIREBASE_PROJECT_ID);
}
