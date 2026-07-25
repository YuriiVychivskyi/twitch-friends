export type PublicIdentityKey = {
  crv: string;
  kty: string;
  x: string;
  y: string;
};

export type LocalIdentity = {
  createdAt: number;
  encryptionPrivateKey: CryptoKey;
  encryptionPublicKey: PublicIdentityKey;
  fingerprint: string;
  signingPrivateKey: CryptoKey;
  signingPublicKey: PublicIdentityKey;
  version: 1;
};
