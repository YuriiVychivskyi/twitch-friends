import { getFirebaseEnvironment } from '@/config/firebaseEnvironment';
import {
  isActiveChannelRequest,
  isActiveChannelUpdate,
  type TwitchChannel,
} from '@/features/presence/twitchChannel';
import {
  refreshPresenceFriends,
  startPresenceSync,
  updatePresenceChannel,
} from '@/features/presence/presenceSync';
import { LOCAL_FRIENDS_KEY } from '@/features/friends/localFriends';
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

function selectChannel(tabId: number, channel: TwitchChannel) {
  const unchanged =
    activeTabId === tabId &&
    activeChannel?.login === channel.login &&
    activeChannel.url === channel.url;

  activeTabId = tabId;
  activeChannel = channel;
  tabChannels.delete(tabId);
  tabChannels.set(tabId, channel);

  if (unchanged) {
    return;
  }

  updatePresenceChannel(activeChannel);
}

function selectFallbackChannel() {
  const fallback = [...tabChannels.entries()]
    .reverse()
    .find((entry): entry is [number, TwitchChannel] => entry[1] !== null);

  if (fallback) {
    selectChannel(...fallback);
    return;
  }

  activeTabId = null;
  activeChannel = null;
  updatePresenceChannel(null);
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
      const tabId = sender.tab.id;

      tabChannels.set(tabId, message.channel);

      if (message.channel && (sender.tab.active || activeTabId === tabId || !activeChannel)) {
        selectChannel(tabId, message.channel);
      } else if (!message.channel && activeTabId === tabId) {
        selectFallbackChannel();
      }
    } else if (isActiveChannelRequest(message)) {
      sendResponse(activeChannel);
    } else if (isRuntimeStatusRequest(message)) {
      sendResponse(getRuntimeStatus());
    }

    return false;
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[LOCAL_FRIENDS_KEY]) {
      refreshPresenceFriends();
    }
  });

  browser.tabs.onActivated.addListener(({ tabId }) => {
    const channel = tabChannels.get(tabId);

    if (channel) {
      selectChannel(tabId, channel);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    tabChannels.delete(tabId);

    if (activeTabId === tabId) {
      selectFallbackChannel();
    }
  });

  void initializeBackground();
});
