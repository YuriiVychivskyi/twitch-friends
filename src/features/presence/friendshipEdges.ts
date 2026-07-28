import { get, ref, remove, set } from 'firebase/database';

import { ensureAnonymousAuth } from '@/infrastructure/firebase/firebaseAuth';
import { getFirebaseDatabase } from '@/infrastructure/firebase/firebaseDatabase';

export async function syncFriendshipEdges(friendIds: string[]) {
  const uid = await ensureAnonymousAuth();
  const friendships = Object.fromEntries(friendIds.map((friendId) => [friendId, true]));

  await set(
    ref(getFirebaseDatabase(), `friendships/${uid}`),
    friendIds.length === 0 ? null : friendships,
  );
}

export async function clearRealtimeAccountData(friendIds: string[]) {
  const uid = await ensureAnonymousAuth();
  const database = getFirebaseDatabase();
  const storedFriendships = await get(ref(database, `friendships/${uid}`));
  const storedValue: unknown = storedFriendships.val();
  const storedIds = storedValue && typeof storedValue === 'object' ? Object.keys(storedValue) : [];
  const recipients = new Set([...storedIds, ...friendIds]);

  await Promise.all(
    [...recipients].map((friendId) => remove(ref(database, `presence/${friendId}/${uid}`))),
  );
  await Promise.all([
    remove(ref(database, `presence/${uid}`)),
    remove(ref(database, `friendships/${uid}`)),
  ]);
}
