import { getFirebaseEnvironment } from '@/config/firebaseEnvironment';
import {
  isActiveChannelRequest,
  isActiveChannelUpdate,
  type TwitchChannel,
} from '@/features/presence/twitchChannel';
import { ensureAnonymousAuth } from '@/infrastructure/firebase/firebaseAuth';
import {
  getRuntimeStatus,
  isRuntimeStatusRequest,
  setRuntimeStatus,
} from '@/runtime/runtimeStatus';
import { getOrCreateLocalIdentity } from '@/security/identity/localIdentity';
import { browser } from 'wxt/browser';

let activeChannel: TwitchChannel | null = null;

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
    if (sender.id !== browser.runtime.id) {
      return false;
    }

    if (
      isActiveChannelUpdate(message) &&
      sender.tab &&
      sender.url?.startsWith('https://www.twitch.tv/')
    ) {
      activeChannel = message.channel;
    } else if (isActiveChannelRequest(message)) {
      sendResponse(activeChannel);
    } else if (isRuntimeStatusRequest(message)) {
      sendResponse(getRuntimeStatus());
    }

    return false;
  });

  void initializeBackground();
});
