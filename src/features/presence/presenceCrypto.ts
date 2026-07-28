import type { LocalIdentity, PublicIdentityKey } from '@/security/identity/localIdentityTypes';
import { isTwitchChannel, type TwitchChannel } from '@/features/presence/twitchChannel';

export type EncryptedPresence = {
  ciphertext: string;
  expiresAt: number;
  iv: string;
  version: 1;
};

const presenceLifetime = 60_000;

function toBase64Url(bytes: Uint8Array) {
  let value = '';

  for (const byte of bytes) {
    value += String.fromCharCode(byte);
  }

  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string) {
  const padded = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const decoded = atob(padded);
  const bytes = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return bytes;
}

async function derivePresenceKey(identity: LocalIdentity, publicKey: PublicIdentityKey) {
  const recipientKey = await crypto.subtle.importKey(
    'jwk',
    publicKey,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    false,
    [],
  );
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: recipientKey,
    },
    identity.encryptionPrivateKey,
    256,
  );
  const keyMaterial = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, [
    'deriveKey',
  ]);

  return crypto.subtle.deriveKey(
    {
      hash: 'SHA-256',
      info: new TextEncoder().encode('twitch-friends-presence-v1'),
      name: 'HKDF',
      salt: new Uint8Array(32),
    },
    keyMaterial,
    {
      length: 256,
      name: 'AES-GCM',
    },
    false,
    ['decrypt', 'encrypt'],
  );
}

export async function encryptPresence(
  identity: LocalIdentity,
  publicKey: PublicIdentityKey,
  channel: TwitchChannel,
): Promise<EncryptedPresence> {
  const expiresAt = Date.now() + presenceLifetime;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(
    JSON.stringify({
      channel,
      expiresAt,
      version: 1,
    }),
  );
  const key = await derivePresenceKey(identity, publicKey);
  const ciphertext = await crypto.subtle.encrypt(
    {
      iv,
      name: 'AES-GCM',
    },
    key,
    plaintext,
  );

  return {
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
    expiresAt,
    iv: toBase64Url(iv),
    version: 1,
  };
}

export async function decryptPresence(
  identity: LocalIdentity,
  publicKey: PublicIdentityKey,
  presence: EncryptedPresence,
) {
  if (presence.version !== 1 || presence.expiresAt <= Date.now()) {
    return null;
  }

  try {
    const key = await derivePresenceKey(identity, publicKey);
    const plaintext = await crypto.subtle.decrypt(
      {
        iv: fromBase64Url(presence.iv),
        name: 'AES-GCM',
      },
      key,
      fromBase64Url(presence.ciphertext),
    );
    const value: unknown = JSON.parse(new TextDecoder().decode(plaintext));

    if (!value || typeof value !== 'object') {
      return null;
    }

    const payload = value as Record<string, unknown>;

    if (
      payload.version !== 1 ||
      payload.expiresAt !== presence.expiresAt ||
      !isTwitchChannel(payload.channel)
    ) {
      return null;
    }

    return payload.channel;
  } catch {
    return null;
  }
}
