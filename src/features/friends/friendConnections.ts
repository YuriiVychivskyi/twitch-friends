import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';

import { isTwitchUserProfile, type TwitchUserProfile } from '@/features/friends/twitchUserProfile';
import { ensureAnonymousAuth } from '@/infrastructure/firebase/firebaseAuth';
import { getFirebaseFunctions } from '@/infrastructure/firebase/firebaseFunctions';

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
  if (!(cause instanceof FirebaseError)) {
    return cause;
  }

  if (cause.code === 'functions/not-found') {
    return new Error('This user has not connected Twitch Friends.', { cause });
  }

  if (cause.code === 'functions/already-exists') {
    return new Error('This user already sent you a friend request.', { cause });
  }

  if (cause.code === 'functions/failed-precondition') {
    return new Error('Connect Twitch or check your incoming requests.', { cause });
  }

  if (cause.code === 'functions/resource-exhausted') {
    return new Error('Request limit reached. Try again later.', { cause });
  }

  if (['functions/internal', 'functions/unavailable'].includes(cause.code)) {
    return new Error('Friends backend is unavailable.', { cause });
  }

  return cause;
}

export async function getFriendState() {
  await ensureAnonymousAuth();

  const getFriends = httpsCallable<undefined, FriendState>(getFirebaseFunctions(), 'getFriends');

  try {
    const result = await getFriends();

    return parseFriendState(result.data);
  } catch (cause) {
    throw friendError(cause);
  }
}

export async function createFriendRequest(login: string) {
  await ensureAnonymousAuth();

  const createRequest = httpsCallable<{ login: string }, { success: boolean }>(
    getFirebaseFunctions(),
    'createFriendRequest',
  );

  try {
    await createRequest({ login });
  } catch (cause) {
    throw friendError(cause);
  }
}

export async function respondToFriendRequest(connectionId: string, accept: boolean) {
  await ensureAnonymousAuth();

  const respond = httpsCallable<{ accept: boolean; connectionId: string }, { success: boolean }>(
    getFirebaseFunctions(),
    'respondToFriendRequest',
  );

  try {
    await respond({
      accept,
      connectionId,
    });
  } catch (cause) {
    throw friendError(cause);
  }
}

export async function removeFriendConnection(connectionId: string) {
  await ensureAnonymousAuth();

  const removeFriend = httpsCallable<{ connectionId: string }, { success: boolean }>(
    getFirebaseFunctions(),
    'removeFriend',
  );

  try {
    await removeFriend({ connectionId });
  } catch (cause) {
    throw friendError(cause);
  }
}
