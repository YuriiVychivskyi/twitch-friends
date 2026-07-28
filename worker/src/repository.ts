import { ApiError } from './errors';
import type { FriendRecord, FriendState, PublicIdentityKey, TwitchUser } from './types';
import { isTwitchUser, validatePublicIdentityKey } from './validation';

type UserRow = {
  avatar_url: string;
  display_name: string;
  firebase_uid: string;
  login: string;
  twitch_id: string;
};

type OAuthStateRow = {
  expires_at: number;
  firebase_uid: string;
};

function rowToProfile(row: UserRow): TwitchUser {
  const profile = {
    avatarUrl: row.avatar_url,
    displayName: row.display_name,
    id: row.twitch_id,
    login: row.login,
  };

  if (!isTwitchUser(profile)) {
    throw new ApiError(500, 'data-loss', 'Stored Twitch profile is invalid.');
  }

  return profile;
}

function rowToFriend(row: UserRow): FriendRecord {
  return {
    id: row.firebase_uid,
    profile: rowToProfile(row),
  };
}

export async function getUserByFirebaseUid(database: D1Database, uid: string) {
  return database
    .prepare(
      `SELECT twitch_id, firebase_uid, login, display_name, avatar_url
       FROM users
       WHERE firebase_uid = ?`,
    )
    .bind(uid)
    .first<UserRow>();
}

export async function getProfileByFirebaseUid(database: D1Database, uid: string) {
  const user = await getUserByFirebaseUid(database, uid);

  return user ? rowToProfile(user) : null;
}

export async function connectTwitchProfile(
  database: D1Database,
  firebaseUid: string,
  profile: TwitchUser,
) {
  const [previousUidOwner, previousLoginOwner] = await Promise.all([
    getUserByFirebaseUid(database, firebaseUid),
    database
      .prepare(
        `SELECT twitch_id, firebase_uid, login, display_name, avatar_url
         FROM users
         WHERE login = ? COLLATE NOCASE`,
      )
      .bind(profile.login)
      .first<UserRow>(),
  ]);
  const statements: D1PreparedStatement[] = [];

  if (previousUidOwner && previousUidOwner.twitch_id !== profile.id) {
    statements.push(
      database.prepare('DELETE FROM users WHERE twitch_id = ?').bind(previousUidOwner.twitch_id),
    );
  }

  if (previousLoginOwner && previousLoginOwner.twitch_id !== profile.id) {
    statements.push(
      database.prepare('DELETE FROM users WHERE twitch_id = ?').bind(previousLoginOwner.twitch_id),
    );
  }

  statements.push(
    database
      .prepare(
        `INSERT INTO users (
           twitch_id,
           firebase_uid,
           login,
           display_name,
           avatar_url,
           updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(twitch_id) DO UPDATE SET
           firebase_uid = excluded.firebase_uid,
           login = excluded.login,
           display_name = excluded.display_name,
           avatar_url = excluded.avatar_url,
           updated_at = excluded.updated_at`,
      )
      .bind(
        profile.id,
        firebaseUid,
        profile.login,
        profile.displayName,
        profile.avatarUrl,
        Date.now(),
      ),
  );

  await database.batch(statements);
}

export async function createOAuthState(
  database: D1Database,
  firebaseUid: string,
  stateHash: string,
  createdAt: number,
  expiresAt: number,
) {
  const previous = await database
    .prepare('SELECT state_hash, created_at FROM oauth_starts WHERE firebase_uid = ?')
    .bind(firebaseUid)
    .first<{ created_at: number; state_hash: string }>();

  if (previous && createdAt - previous.created_at < 10_000) {
    throw new ApiError(429, 'resource-exhausted', 'Wait before starting authorization again.');
  }

  const statements = [
    database.prepare('DELETE FROM oauth_states WHERE firebase_uid = ?').bind(firebaseUid),
    database
      .prepare(
        `INSERT INTO oauth_starts (firebase_uid, state_hash, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(firebase_uid) DO UPDATE SET
           state_hash = excluded.state_hash,
           created_at = excluded.created_at`,
      )
      .bind(firebaseUid, stateHash, createdAt),
    database
      .prepare(
        `INSERT INTO oauth_states (state_hash, firebase_uid, expires_at)
         VALUES (?, ?, ?)`,
      )
      .bind(stateHash, firebaseUid, expiresAt),
  ];

  await database.batch(statements);
}

export async function consumeOAuthState(database: D1Database, stateHash: string) {
  const state = await database
    .prepare(
      `DELETE FROM oauth_states
       WHERE state_hash = ?
       RETURNING firebase_uid, expires_at`,
    )
    .bind(stateHash)
    .first<OAuthStateRow>();

  if (state) {
    await database
      .prepare('DELETE FROM oauth_starts WHERE firebase_uid = ? AND state_hash = ?')
      .bind(state.firebase_uid, stateHash)
      .run();
  }

  return state;
}

export async function sendFriendRequest(
  database: D1Database,
  firebaseUid: string,
  recipientLogin: string,
) {
  const [sender, recipient] = await Promise.all([
    getUserByFirebaseUid(database, firebaseUid),
    database
      .prepare(
        `SELECT twitch_id, firebase_uid, login, display_name, avatar_url
         FROM users
         WHERE login = ? COLLATE NOCASE`,
      )
      .bind(recipientLogin)
      .first<UserRow>(),
  ]);

  if (!sender) {
    throw new ApiError(412, 'failed-precondition', 'Connect your Twitch profile first.');
  }

  if (!recipient) {
    throw new ApiError(404, 'not-found', 'This Twitch user has not connected Twitch Friends.');
  }

  if (recipient.twitch_id === sender.twitch_id) {
    throw new ApiError(400, 'invalid-argument', 'You cannot add yourself.');
  }

  const userA = [sender.twitch_id, recipient.twitch_id].sort()[0] ?? '';
  const userB = [sender.twitch_id, recipient.twitch_id].sort()[1] ?? '';
  const [friendship, outgoing, reverse] = await Promise.all([
    database
      .prepare('SELECT 1 AS found FROM friendships WHERE user_a = ? AND user_b = ?')
      .bind(userA, userB)
      .first<{ found: number }>(),
    database
      .prepare('SELECT 1 AS found FROM friend_requests WHERE sender_id = ? AND recipient_id = ?')
      .bind(sender.twitch_id, recipient.twitch_id)
      .first<{ found: number }>(),
    database
      .prepare('SELECT 1 AS found FROM friend_requests WHERE sender_id = ? AND recipient_id = ?')
      .bind(recipient.twitch_id, sender.twitch_id)
      .first<{ found: number }>(),
  ]);

  if (friendship || outgoing) {
    return;
  }

  if (reverse) {
    throw new ApiError(409, 'already-exists', 'This user already sent you a friend request.');
  }

  await database
    .prepare(
      `INSERT OR IGNORE INTO friend_requests (sender_id, recipient_id, created_at)
       VALUES (?, ?, ?)`,
    )
    .bind(sender.twitch_id, recipient.twitch_id, Date.now())
    .run();
}

async function listFriendRows(database: D1Database, twitchId: string) {
  const result = await database
    .prepare(
      `SELECT
         users.twitch_id,
         users.firebase_uid,
         users.login,
         users.display_name,
         users.avatar_url
       FROM friendships
       JOIN users ON users.twitch_id = CASE
         WHEN friendships.user_a = ? THEN friendships.user_b
         ELSE friendships.user_a
       END
       WHERE friendships.user_a = ? OR friendships.user_b = ?
       ORDER BY users.login COLLATE NOCASE`,
    )
    .bind(twitchId, twitchId, twitchId)
    .all<UserRow>();

  return result.results;
}

async function listRequestRows(
  database: D1Database,
  twitchId: string,
  direction: 'incoming' | 'outgoing',
) {
  const userColumn = direction === 'incoming' ? 'sender_id' : 'recipient_id';
  const filterColumn = direction === 'incoming' ? 'recipient_id' : 'sender_id';
  const result = await database
    .prepare(
      `SELECT
         users.twitch_id,
         users.firebase_uid,
         users.login,
         users.display_name,
         users.avatar_url
       FROM friend_requests
       JOIN users ON users.twitch_id = friend_requests.${userColumn}
       WHERE friend_requests.${filterColumn} = ?
       ORDER BY users.login COLLATE NOCASE`,
    )
    .bind(twitchId)
    .all<UserRow>();

  return result.results;
}

export async function getFriendState(
  database: D1Database,
  firebaseUid: string,
): Promise<FriendState> {
  const user = await getUserByFirebaseUid(database, firebaseUid);

  if (!user) {
    return {
      friends: [],
      incoming: [],
      outgoing: [],
    };
  }

  const [friends, incoming, outgoing] = await Promise.all([
    listFriendRows(database, user.twitch_id),
    listRequestRows(database, user.twitch_id, 'incoming'),
    listRequestRows(database, user.twitch_id, 'outgoing'),
  ]);

  return {
    friends: friends.map(rowToFriend),
    incoming: incoming.map(rowToFriend),
    outgoing: outgoing.map(rowToFriend),
  };
}

export async function respondToFriendRequest(
  database: D1Database,
  firebaseUid: string,
  senderFirebaseUid: string,
  accept: boolean,
) {
  const [recipient, sender] = await Promise.all([
    getUserByFirebaseUid(database, firebaseUid),
    getUserByFirebaseUid(database, senderFirebaseUid),
  ]);

  if (!recipient || !sender) {
    throw new ApiError(404, 'not-found', 'Friend request not found.');
  }

  const request = await database
    .prepare('SELECT 1 AS found FROM friend_requests WHERE sender_id = ? AND recipient_id = ?')
    .bind(sender.twitch_id, recipient.twitch_id)
    .first<{ found: number }>();

  if (!request) {
    throw new ApiError(404, 'not-found', 'Friend request not found.');
  }

  const statements = [
    database
      .prepare('DELETE FROM friend_requests WHERE sender_id = ? AND recipient_id = ?')
      .bind(sender.twitch_id, recipient.twitch_id),
  ];

  if (accept) {
    const [userA = '', userB = ''] = [sender.twitch_id, recipient.twitch_id].sort();

    statements.push(
      database
        .prepare(
          `INSERT OR IGNORE INTO friendships (user_a, user_b, created_at)
           VALUES (?, ?, ?)`,
        )
        .bind(userA, userB, Date.now()),
    );
  }

  await database.batch(statements);
}

export async function removeFriendConnection(
  database: D1Database,
  firebaseUid: string,
  connectionFirebaseUid: string,
) {
  const [user, connection] = await Promise.all([
    getUserByFirebaseUid(database, firebaseUid),
    getUserByFirebaseUid(database, connectionFirebaseUid),
  ]);

  if (!user || !connection) {
    return;
  }

  const [userA = '', userB = ''] = [user.twitch_id, connection.twitch_id].sort();

  await database.batch([
    database.prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').bind(userA, userB),
    database
      .prepare(
        `DELETE FROM friend_requests
         WHERE (sender_id = ? AND recipient_id = ?)
            OR (sender_id = ? AND recipient_id = ?)`,
      )
      .bind(user.twitch_id, connection.twitch_id, connection.twitch_id, user.twitch_id),
  ]);
}

export async function saveIdentityKey(
  database: D1Database,
  firebaseUid: string,
  encryptionKey: PublicIdentityKey,
) {
  const user = await getUserByFirebaseUid(database, firebaseUid);

  if (!user) {
    throw new ApiError(412, 'failed-precondition', 'Connect your Twitch profile first.');
  }

  await database
    .prepare(
      `INSERT INTO identity_keys (twitch_id, encryption_key, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(twitch_id) DO UPDATE SET
         encryption_key = excluded.encryption_key,
         updated_at = excluded.updated_at`,
    )
    .bind(user.twitch_id, JSON.stringify(encryptionKey), Date.now())
    .run();
}

export async function getPresenceFriends(database: D1Database, firebaseUid: string) {
  const user = await getUserByFirebaseUid(database, firebaseUid);

  if (!user) {
    return [];
  }

  const result = await database
    .prepare(
      `SELECT
         users.twitch_id,
         users.firebase_uid,
         users.login,
         users.display_name,
         users.avatar_url,
         identity_keys.encryption_key
       FROM friendships
       JOIN users ON users.twitch_id = CASE
         WHEN friendships.user_a = ? THEN friendships.user_b
         ELSE friendships.user_a
       END
       JOIN identity_keys ON identity_keys.twitch_id = users.twitch_id
       WHERE friendships.user_a = ? OR friendships.user_b = ?
       ORDER BY users.login COLLATE NOCASE`,
    )
    .bind(user.twitch_id, user.twitch_id, user.twitch_id)
    .all<UserRow & { encryption_key: string }>();

  return result.results.flatMap((row) => {
    try {
      const encryptionKey = validatePublicIdentityKey(JSON.parse(row.encryption_key) as unknown);

      return [
        {
          encryptionKey,
          id: row.firebase_uid,
          profile: rowToProfile(row),
        },
      ];
    } catch {
      return [];
    }
  });
}

export async function removeAccount(database: D1Database, firebaseUid: string) {
  const user = await getUserByFirebaseUid(database, firebaseUid);
  const friendIds = user
    ? (await listFriendRows(database, user.twitch_id)).map((friend) => friend.firebase_uid)
    : [];

  await database.batch([
    database.prepare('DELETE FROM users WHERE firebase_uid = ?').bind(firebaseUid),
    database.prepare('DELETE FROM oauth_states WHERE firebase_uid = ?').bind(firebaseUid),
    database.prepare('DELETE FROM oauth_starts WHERE firebase_uid = ?').bind(firebaseUid),
  ]);

  return friendIds;
}
export async function cleanupExpiredData(database: D1Database, now: number) {
  const oldestDailyUsage = new Date(now - 30 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);

  await database.batch([
    database.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(now),
    database
      .prepare('DELETE FROM oauth_starts WHERE created_at <= ?')
      .bind(now - 24 * 60 * 60 * 1_000),
    database.prepare('DELETE FROM rate_limits WHERE resets_at <= ?').bind(now),
    database.prepare('DELETE FROM daily_usage WHERE day < ?').bind(oldestDailyUsage),
  ]);
}
