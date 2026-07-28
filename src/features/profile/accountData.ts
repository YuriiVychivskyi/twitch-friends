import { browser } from 'wxt/browser';

import { isAccountSetupRequired, requireAccountSetup } from '@/features/profile/accountState';
import { clearRealtimeAccountData } from '@/features/presence/friendshipEdges';
import { BackendError, requestBackend } from '@/infrastructure/backend/backendApi';
import { deleteFirebaseAccount } from '@/infrastructure/firebase/firebaseAuth';
import { deleteLocalIdentity } from '@/security/identity/identityDatabase';

type AccountActionResult = {
  friendIds: string[];
  success: boolean;
};

function accountActionError(cause: unknown) {
  if (!(cause instanceof BackendError)) {
    return cause;
  }

  if (cause.code === 'resource-exhausted') {
    return new Error('Wait a few seconds before trying again.', { cause });
  }

  if (['internal', 'unavailable'].includes(cause.code)) {
    return new Error('Account backend is unavailable.', { cause });
  }

  return cause;
}

async function callAccountAction(name: 'deleteMyData' | 'disconnectTwitch') {
  try {
    const result = await requestBackend<AccountActionResult>(
      name === 'deleteMyData' ? '/api/account' : '/api/account/disconnect',
      {
        method: name === 'deleteMyData' ? 'DELETE' : 'POST',
      },
    );

    if (
      result.success !== true ||
      !Array.isArray(result.friendIds) ||
      !result.friendIds.every(
        (friendId) => typeof friendId === 'string' && /^[a-z0-9_-]{1,128}$/iu.test(friendId),
      )
    ) {
      throw new Error('Account backend returned invalid data.');
    }

    await clearRealtimeAccountData(result.friendIds);
  } catch (cause) {
    throw accountActionError(cause);
  }
}

export async function disconnectTwitch() {
  await callAccountAction('disconnectTwitch');
  await browser.storage.local.clear();
  browser.runtime.reload();
}

export async function deleteMyData() {
  if (!(await isAccountSetupRequired())) {
    await callAccountAction('deleteMyData');
  }

  const cleanupResults = await Promise.allSettled([
    deleteFirebaseAccount(),
    deleteLocalIdentity(),
    browser.storage.local.clear(),
  ]);

  await requireAccountSetup();

  const failedCleanup = cleanupResults.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

  if (failedCleanup) {
    throw failedCleanup.reason;
  }

  browser.runtime.reload();
}
