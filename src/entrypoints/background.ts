import { getFirebaseEnvironment } from '@/config/firebaseEnvironment';
import {
  isActiveChannelRequest,
  isActiveChannelUpdate,
  type TwitchChannel,
} from '@/features/presence/twitchChannel';
import {
  refreshPresenceFriends,
  refreshPresenceSharing,
  startPresenceSync,
  updatePresenceChannel,
} from '@/features/presence/presenceSync';
import { LOCAL_FRIENDS_KEY } from '@/features/friends/localFriends';
import { PRIVACY_SETTINGS_KEY } from '@/features/privacy/privacySettings';
import { ensureAnonymousAuth } from '@/infrastructure/firebase/firebaseAuth';
import {
  getRuntimeStatus,
  isRuntimeStatusRequest,
  setRuntimeStatus,
} from '@/runtime/runtimeStatus';
import { getOrCreateLocalIdentity } from '@/security/identity/localIdentity';
import { browser } from 'wxt/browser';

let activeChannel: TwitchChannel | null = null;
let activeTabId: number | null = null;
const tabChannels = new Map<number, TwitchChannel | null>();

function selectActiveTab(tabId: number | null) {
  activeTabId = tabId;
  activeChannel = tabId === null ? null : (tabChannels.get(tabId) ?? null);
  updatePresenceChannel(activeChannel);
}

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
    const privateKeysProtected = !identity.encryptionPrivateKey.extractable;

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

  try {
    await startPresenceSync(activeChannel);
  } catch {
    return;
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) {
      return false;
    }

    if (
      isActiveChannelUpdate(message) &&
      typeof sender.tab?.id === 'number' &&
      sender.url?.startsWith('https://www.twitch.tv/')
    ) {
      tabChannels.set(sender.tab.id, message.channel);

      if (sender.tab.active || activeTabId === sender.tab.id) {
        selectActiveTab(sender.tab.id);
      }
    } else if (isActiveChannelRequest(message)) {
      sendResponse(activeChannel);
    } else if (isRuntimeStatusRequest(message)) {
      sendResponse(getRuntimeStatus());
    }

    return false;
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[PRIVACY_SETTINGS_KEY]) {
      refreshPresenceSharing();
    }

    if (areaName === 'local' && changes[LOCAL_FRIENDS_KEY]) {
      refreshPresenceFriends();
    }
  });

  browser.tabs.onActivated.addListener(({ tabId }) => {
    selectActiveTab(tabId);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    tabChannels.delete(tabId);

    if (activeTabId === tabId) {
      selectActiveTab(null);
    }
  });

  browser.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === browser.windows.WINDOW_ID_NONE) {
      selectActiveTab(null);
      return;
    }

    void browser.tabs
      .query({
        active: true,
        windowId,
      })
      .then(([tab]) => {
        selectActiveTab(typeof tab?.id === 'number' ? tab.id : null);
      })
      .catch(() => undefined);
  });

  void initializeBackground();
});
