import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { getOrCreateLocalIdentity } from '@/security/identity/localIdentity';
import { deleteLocalIdentity, readLocalIdentity } from '@/security/identity/identityDatabase';

describe('local identity', () => {
  it('creates and persists non-extractable private keys', async () => {
    const firstIdentity = await getOrCreateLocalIdentity();
    const secondIdentity = await getOrCreateLocalIdentity();

    expect(firstIdentity).toBe(secondIdentity);
    expect(firstIdentity.version).toBe(1);
    expect(firstIdentity.encryptionPrivateKey.extractable).toBe(false);
    expect(firstIdentity.encryptionPublicKey.kty).toBe('EC');

    await expect(
      crypto.subtle.exportKey('jwk', firstIdentity.encryptionPrivateKey),
    ).rejects.toThrow();
  });

  it('deletes the persisted identity', async () => {
    await getOrCreateLocalIdentity();
    await deleteLocalIdentity();

    await expect(readLocalIdentity()).resolves.toBeNull();
  });
});
