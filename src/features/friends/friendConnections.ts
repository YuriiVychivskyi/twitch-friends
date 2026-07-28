import { isTwitchUserProfile, type TwitchUserProfile } from '@/features/friends/twitchUserProfile';
import { syncFriendshipEdges } from '@/features/presence/friendshipEdges';
import { BackendError, requestBackend } from '@/infrastructure/backend/backendApi';

export type FriendConnection = {
  id: string;
  profile: TwitchUserProfile;
};

export type FriendState = {
  friends: FriendConnection[];
  incoming: FriendConnection[];
  outgoing: FriendConnection[];
};

function parseConnections(value: unknown): FriendConnection[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const connections: FriendConnection[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const connection = item as Record<string, unknown>;

    if (
      typeof connection.id !== 'string' ||
      !/^[a-z0-9_-]{1,128}$/iu.test(connection.id) ||
      !isTwitchUserProfile(connection.profile)
    ) {
      return null;
    }

    connections.push({
      id: connection.id,
      profile: connection.profile,
    });
  }

  return connections;
}

function parseFriendState(value: unknown): FriendState {
  if (!value || typeof value !== 'object') {
    throw new Error('Friends backend returned invalid data.');
  }

  const state = value as Record<string, unknown>;
  const friends = parseConnections(state.friends);
  const incoming = parseConnections(state.incoming);
  const outgoing = parseConnections(state.outgoing);

  if (!friends || !incoming || !outgoing) {
    throw new Error('Friends backend returned invalid data.');
  }

  return {
    friends,
    incoming,
    outgoing,
  };
}

function friendError(cause: unknown) {
  if (!(cause instanceof BackendError)) {
    return cause;
  }

  if (cause.code === 'not-found') {
    return new Error('This user has not connected Twitch Friends.', { cause });
  }

  if (cause.code === 'already-exists') {
    return new Error('This user already sent you a friend request.', { cause });
  }

  if (cause.code === 'failed-precondition') {
    return new Error('Connect Twitch or check your incoming requests.', { cause });
  }

  if (cause.code === 'resource-exhausted') {
    return new Error('Request limit reached. Try again later.', { cause });
  }

  if (['internal', 'unavailable'].includes(cause.code)) {
    return new Error('Friends backend is unavailable.', { cause });
  }

  return cause;
}

export async function getFriendState() {
  try {
    const state = parseFriendState(await requestBackend<FriendState>('/api/friends'));

    await syncFriendshipEdges(state.friends.map((friend) => friend.id));

    return state;
  } catch (cause) {
    throw friendError(cause);
  }
}

export async function createFriendRequest(login: string) {
  try {
    await requestBackend('/api/friends/requests', {
      body: { login },
      method: 'POST',
    });
  } catch (cause) {
    throw friendError(cause);
  }
}

export async function respondToFriendRequest(connectionId: string, accept: boolean) {
  try {
    await requestBackend('/api/friends/respond', {
      body: {
        accept,
        connectionId,
      },
      method: 'POST',
    });
  } catch (cause) {
    throw friendError(cause);
  }
}

export async function removeFriendConnection(connectionId: string) {
  try {
    await requestBackend(`/api/friends/${encodeURIComponent(connectionId)}`, {
      method: 'DELETE',
    });
  } catch (cause) {
    throw friendError(cause);
  }
}
