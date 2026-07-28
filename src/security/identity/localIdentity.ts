import { readLocalIdentity, writeLocalIdentity } from '@/security/identity/identityDatabase';
import { type LocalIdentity, type PublicIdentityKey } from '@/security/identity/localIdentityTypes';

let identityPromise: Promise<LocalIdentity> | null = null;

function normalizePublicKey(key: JsonWebKey): PublicIdentityKey {
  if (key.crv !== 'P-256' || key.kty !== 'EC' || !key.x || !key.y) {
    throw new Error('Generated public key is incomplete.');
  }

  return {
    crv: key.crv,
    kty: key.kty,
    x: key.x,
    y: key.y,
  };
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
  const encryptionPublicKey = normalizePublicKey(
    await crypto.subtle.exportKey('jwk', encryptionKeyPair.publicKey),
  );

  return {
    createdAt: Date.now(),
    encryptionPrivateKey: encryptionKeyPair.privateKey,
    encryptionPublicKey,
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
