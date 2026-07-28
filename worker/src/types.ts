export type Env = {
  ALLOWED_EXTENSION_ORIGINS: string;
  ALLOW_INSECURE_EMULATOR_AUTH?: string;
  DB: D1Database;
  FIREBASE_PROJECT_ID: string;
  TWITCH_CLIENT_ID: string;
  TWITCH_CLIENT_SECRET: string;
  TWITCH_OAUTH_CALLBACK_URL: string;
};

export type FirebaseIdentity = {
  uid: string;
};

export type TwitchUser = {
  avatarUrl: string;
  displayName: string;
  id: string;
  login: string;
};

export type PublicIdentityKey = {
  crv: 'P-256';
  kty: 'EC';
  x: string;
  y: string;
};

export type FriendRecord = {
  id: string;
  profile: TwitchUser;
};

export type FriendState = {
  friends: FriendRecord[];
  incoming: FriendRecord[];
  outgoing: FriendRecord[];
};
