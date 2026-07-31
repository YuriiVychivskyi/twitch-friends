import { get, ref, remove } from 'firebase/database';

import { ensureAnonymousAuth } from '@/infrastructure/firebase/firebaseAuth';
import { getFirebaseDatabase } from '@/infrastructure/firebase/firebaseDatabase';

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
  await remove(ref(database, `presence/${uid}`));
}
