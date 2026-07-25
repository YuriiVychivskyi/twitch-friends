import { getFirebaseEnvironment } from '@/config/firebaseEnvironment';
import { ensureAnonymousAuth } from '@/infrastructure/firebase/firebaseAuth';
import {
  getRuntimeStatus,
  isRuntimeStatusRequest,
  setRuntimeStatus,
} from '@/runtime/runtimeStatus';
import { getOrCreateLocalIdentity } from '@/security/identity/localIdentity';
import { browser } from 'wxt/browser';

async function initializeBackground() {
  try {
    const environment = getFirebaseEnvironment();

    setRuntimeStatus({
      environment: environment.useEmulators ? 'emulator' : 'production',
    });
  } catch {
    setRuntimeStatus({
      environment: 'unknown',
    });
  }

  try {
    const identity = await getOrCreateLocalIdentity();
    const privateKeysProtected =
      !identity.encryptionPrivateKey.extractable && !identity.signingPrivateKey.extractable;

    setRuntimeStatus({
      localIdentity: 'ready',
      privateKeys: privateKeysProtected ? 'ready' : 'unavailable',
    });
  } catch {
    setRuntimeStatus({
      localIdentity: 'unavailable',
      privateKeys: 'unavailable',
    });
  }

  try {
    await ensureAnonymousAuth();
    setRuntimeStatus({
      firebaseAuth: 'ready',
    });
  } catch {
    setRuntimeStatus({
      firebaseAuth: 'unavailable',
    });
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id || !isRuntimeStatusRequest(message)) {
      return false;
    }

    sendResponse(getRuntimeStatus());

    return false;
  });

  void initializeBackground();
});
