import { FieldValue, getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import { HttpsError } from 'firebase-functions/v2/https';

import { isTwitchUser, type TwitchUser } from './twitchClient';

export type FriendRecord = {
  id: string;
  profile: TwitchUser;
};

function getDocumentValue(document: DocumentSnapshot, field: string): unknown {
  const data: unknown = document.data();

  if (!data || typeof data !== 'object') {
    return undefined;
  }

  return (data as Record<string, unknown>)[field];
}

function parseProfile(value: unknown): TwitchUser | null {
  if (!isTwitchUser(value)) {
    return null;
  }

  return {
    avatarUrl: value.avatarUrl,
    displayName: value.displayName,
    id: value.id,
    login: value.login,
  };
}

function readStoredProfile(document: DocumentSnapshot) {
  return parseProfile(getDocumentValue(document, 'profile'));
}

function friendUser(uid: string) {
  return getFirestore().collection('friendUsers').doc(uid);
}

async function getProfileForUid(uid: string) {
  const firestore = getFirestore();
  const userProfile = await firestore.collection('userProfiles').doc(uid).get();
  const login = getDocumentValue(userProfile, 'login');

  if (typeof login !== 'string') {
    return null;
  }

  const publicProfile = await firestore.collection('publicProfiles').doc(login).get();

  return parseProfile(publicProfile.data());
}

async function getRegisteredUser(login: string) {
  const firestore = getFirestore();
  const [owner, publicProfile] = await Promise.all([
    firestore.collection('profileOwners').doc(login).get(),
    firestore.collection('publicProfiles').doc(login).get(),
  ]);
  const uid = getDocumentValue(owner, 'uid');
  const profile = parseProfile(publicProfile.data());

  if (typeof uid !== 'string' || !profile) {
    return null;
  }

  return {
    profile,
    uid,
  };
}

function parseFriendRecords(documents: DocumentSnapshot[]) {
  return documents
    .map((document) => {
      const profile = readStoredProfile(document);

      return profile
        ? {
            id: document.id,
            profile,
          }
        : null;
    })
    .filter((record): record is FriendRecord => record !== null)
    .sort((first, second) => first.profile.login.localeCompare(second.profile.login));
}

export async function sendFriendRequest(uid: string, login: string) {
  const [senderProfile, recipient] = await Promise.all([
    getProfileForUid(uid),
    getRegisteredUser(login),
  ]);

  if (!senderProfile) {
    throw new HttpsError('failed-precondition', 'Connect your Twitch profile first.');
  }

  if (!recipient) {
    throw new HttpsError('not-found', 'This Twitch user has not connected Twitch Friends.');
  }

  if (recipient.uid === uid) {
    throw new HttpsError('invalid-argument', 'You cannot add yourself.');
  }

  const sender = friendUser(uid);
  const recipientUser = friendUser(recipient.uid);
  const outgoingReference = sender.collection('outgoingRequests').doc(recipient.uid);
  const incomingReference = recipientUser.collection('incomingRequests').doc(uid);
  const reverseRequestReference = sender.collection('incomingRequests').doc(recipient.uid);
  const friendshipReference = sender.collection('friends').doc(recipient.uid);

  await getFirestore().runTransaction(async (transaction) => {
    const [friendship, outgoingRequest, reverseRequest] = await Promise.all([
      transaction.get(friendshipReference),
      transaction.get(outgoingReference),
      transaction.get(reverseRequestReference),
    ]);

    if (friendship.exists || outgoingRequest.exists) {
      return;
    }

    if (reverseRequest.exists) {
      throw new HttpsError('already-exists', 'This user already sent you a friend request.');
    }

    transaction.set(outgoingReference, {
      createdAt: FieldValue.serverTimestamp(),
      profile: recipient.profile,
    });
    transaction.set(incomingReference, {
      createdAt: FieldValue.serverTimestamp(),
      profile: senderProfile,
    });
  });
}

export async function getFriendState(uid: string) {
  const user = friendUser(uid);
  const [friends, incoming, outgoing] = await Promise.all([
    user.collection('friends').get(),
    user.collection('incomingRequests').get(),
    user.collection('outgoingRequests').get(),
  ]);
  const friendRecords = parseFriendRecords(friends.docs);

  if (friendRecords.length > 0) {
    const updates = Object.fromEntries(
      friendRecords.flatMap((friend) => [
        [`friendships/${uid}/${friend.id}`, true],
        [`friendships/${friend.id}/${uid}`, true],
      ]),
    );

    await getDatabase().ref().update(updates);
  }

  return {
    friends: friendRecords,
    incoming: parseFriendRecords(incoming.docs),
    outgoing: parseFriendRecords(outgoing.docs),
  };
}

export async function respondToFriendRequest(uid: string, senderUid: string, accept: boolean) {
  const recipient = friendUser(uid);
  const sender = friendUser(senderUid);
  const incomingReference = recipient.collection('incomingRequests').doc(senderUid);
  const outgoingReference = sender.collection('outgoingRequests').doc(uid);

  let recipientProfile: TwitchUser | null = null;
  let senderProfile: TwitchUser | null = null;

  if (accept) {
    [recipientProfile, senderProfile] = await Promise.all([
      getProfileForUid(uid),
      getProfileForUid(senderUid),
    ]);

    if (!recipientProfile || !senderProfile) {
      throw new HttpsError('failed-precondition', 'A Twitch profile is no longer available.');
    }
  }

  await getFirestore().runTransaction(async (transaction) => {
    const incomingRequest = await transaction.get(incomingReference);

    if (!incomingRequest.exists) {
      throw new HttpsError('not-found', 'Friend request not found.');
    }

    transaction.delete(incomingReference);
    transaction.delete(outgoingReference);

    if (accept && recipientProfile && senderProfile) {
      transaction.set(recipient.collection('friends').doc(senderUid), {
        createdAt: FieldValue.serverTimestamp(),
        profile: senderProfile,
      });
      transaction.set(sender.collection('friends').doc(uid), {
        createdAt: FieldValue.serverTimestamp(),
        profile: recipientProfile,
      });
    }
  });

  if (accept) {
    await getDatabase()
      .ref()
      .update({
        [`friendships/${uid}/${senderUid}`]: true,
        [`friendships/${senderUid}/${uid}`]: true,
      });
  }
}

export async function removeFriendConnection(uid: string, friendUid: string) {
  const user = friendUser(uid);
  const friend = friendUser(friendUid);
  const batch = getFirestore().batch();

  batch.delete(user.collection('friends').doc(friendUid));
  batch.delete(friend.collection('friends').doc(uid));
  batch.delete(user.collection('incomingRequests').doc(friendUid));
  batch.delete(friend.collection('outgoingRequests').doc(uid));
  batch.delete(user.collection('outgoingRequests').doc(friendUid));
  batch.delete(friend.collection('incomingRequests').doc(uid));

  await batch.commit();
  await getDatabase()
    .ref()
    .update({
      [`friendships/${uid}/${friendUid}`]: null,
      [`friendships/${friendUid}/${uid}`]: null,
      [`presence/${uid}/${friendUid}`]: null,
      [`presence/${friendUid}/${uid}`]: null,
    });
}

export async function removeAllFriendConnections(uid: string) {
  const user = friendUser(uid);
  const [friends, incoming, outgoing] = await Promise.all([
    user.collection('friends').get(),
    user.collection('incomingRequests').get(),
    user.collection('outgoingRequests').get(),
  ]);
  const connectionIds = new Set(
    [...friends.docs, ...incoming.docs, ...outgoing.docs].map((document) => document.id),
  );

  await Promise.all(
    [...connectionIds].map((connectionId) => removeFriendConnection(uid, connectionId)),
  );
  await Promise.all([
    getFirestore().collection('publicIdentityKeys').doc(uid).delete(),
    getDatabase().ref(`friendships/${uid}`).remove(),
    getDatabase().ref(`presence/${uid}`).remove(),
  ]);
}
