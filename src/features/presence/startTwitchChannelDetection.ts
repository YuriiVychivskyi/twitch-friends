import { browser } from 'wxt/browser';

import {
  ACTIVE_CHANNEL_UPDATE,
  parseTwitchChannel,
  type TwitchChannel,
} from '@/features/presence/twitchChannel';

export function startTwitchChannelDetection() {
  let previousUrl: string | null = null;

  const sendChannelUpdate = async (channel: TwitchChannel | null) => {
    try {
      await browser.runtime.sendMessage({
        channel,
        type: ACTIVE_CHANNEL_UPDATE,
      });
    } catch {
      return;
    }
  };

  const updateChannel = () => {
    if (document.visibilityState !== 'visible') {
      if (previousUrl !== null) {
        previousUrl = null;
        void sendChannelUpdate(null);
      }

      return;
    }

    if (window.location.href === previousUrl) {
      return;
    }

    previousUrl = window.location.href;
    void sendChannelUpdate(parseTwitchChannel(previousUrl));
  };

  const observer = new MutationObserver(updateChannel);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  window.addEventListener('popstate', updateChannel);
  window.addEventListener('focus', updateChannel);
  document.addEventListener('visibilitychange', updateChannel);
  updateChannel();

  return () => {
    observer.disconnect();
    window.removeEventListener('popstate', updateChannel);
    window.removeEventListener('focus', updateChannel);
    document.removeEventListener('visibilitychange', updateChannel);
  };
}
