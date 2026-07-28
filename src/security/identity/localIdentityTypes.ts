export type PublicIdentityKey = {
  crv: 'P-256';
  kty: 'EC';
  x: string;
  y: string;
};

export type LocalIdentity = {
  createdAt: number;
  encryptionPrivateKey: CryptoKey;
  encryptionPublicKey: PublicIdentityKey;
  version: 1;
};
