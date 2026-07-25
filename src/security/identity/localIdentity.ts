import { readLocalIdentity, writeLocalIdentity } from '@/security/identity/identityDatabase';
import { type LocalIdentity, type PublicIdentityKey } from '@/security/identity/localIdentityTypes';

let identityPromise: Promise<LocalIdentity> | null = null;

function normalizePublicKey(key: JsonWebKey): PublicIdentityKey {
  if (!key.crv || !key.kty || !key.x || !key.y) {
    throw new Error('Generated public key is incomplete.');
  }

  return {
    crv: key.crv,
    kty: key.kty,
    x: key.x,
    y: key.y,
  };
}

function toBase64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let value = '';

  for (const byte of bytes) {
    value += String.fromCharCode(byte);
  }

  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

async function createFingerprint(encryptionKey: PublicIdentityKey, signingKey: PublicIdentityKey) {
  const encodedIdentity = new TextEncoder().encode(
    JSON.stringify({
      encryptionKey,
      signingKey,
      version: 1,
    }),
  );
  const digest = await crypto.subtle.digest('SHA-256', encodedIdentity);

  return toBase64Url(digest);
}

async function createLocalIdentity(): Promise<LocalIdentity> {
  const encryptionKeyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    false,
    ['deriveBits'],
  );
  const signingKeyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false,
    ['sign', 'verify'],
  );
  const encryptionPublicKey = normalizePublicKey(
    await crypto.subtle.exportKey('jwk', encryptionKeyPair.publicKey),
  );
  const signingPublicKey = normalizePublicKey(
    await crypto.subtle.exportKey('jwk', signingKeyPair.publicKey),
  );

  return {
    createdAt: Date.now(),
    encryptionPrivateKey: encryptionKeyPair.privateKey,
    encryptionPublicKey,
    fingerprint: await createFingerprint(encryptionPublicKey, signingPublicKey),
    signingPrivateKey: signingKeyPair.privateKey,
    signingPublicKey,
    version: 1,
  };
}

async function loadOrCreateLocalIdentity() {
  const existingIdentity = await readLocalIdentity();

  if (existingIdentity) {
    return existingIdentity;
  }

  const identity = await createLocalIdentity();

  await writeLocalIdentity(identity);

  return identity;
}

export function getOrCreateLocalIdentity() {
  identityPromise ??= loadOrCreateLocalIdentity();

  return identityPromise;
}
