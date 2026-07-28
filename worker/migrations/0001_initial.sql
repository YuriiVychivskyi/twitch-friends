PRAGMA foreign_keys = ON;

CREATE TABLE users (
  twitch_id TEXT PRIMARY KEY NOT NULL,
  firebase_uid TEXT NOT NULL UNIQUE,
  login TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE friend_requests (
  sender_id TEXT NOT NULL REFERENCES users(twitch_id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(twitch_id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (sender_id, recipient_id),
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX friend_requests_recipient
ON friend_requests(recipient_id);

CREATE TABLE friendships (
  user_a TEXT NOT NULL REFERENCES users(twitch_id) ON DELETE CASCADE,
  user_b TEXT NOT NULL REFERENCES users(twitch_id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE INDEX friendships_user_b
ON friendships(user_b);

CREATE TABLE identity_keys (
  twitch_id TEXT PRIMARY KEY NOT NULL REFERENCES users(twitch_id) ON DELETE CASCADE,
  encryption_key TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE oauth_starts (
  firebase_uid TEXT PRIMARY KEY NOT NULL,
  state_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY NOT NULL,
  firebase_uid TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX oauth_states_firebase_uid
ON oauth_states(firebase_uid);

CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  resets_at INTEGER NOT NULL
);

CREATE TABLE daily_usage (
  day TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1))
);
