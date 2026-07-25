import { browser } from 'wxt/browser';

import { ACTIVE_CHANNEL_UPDATE, parseTwitchChannel } from '@/features/presence/twitchChannel';

export function startTwitchChannelDetection() {
  let previousUrl: string | null = null;

  const updateChannel = () => {
    if (document.visibilityState !== 'visible') {
      previousUrl = null;
      return;
    }

    if (window.location.href === previousUrl) {
      return;
    }

    previousUrl = window.location.href;

    void browser.runtime
      .sendMessage({
        channel: parseTwitchChannel(previousUrl),
        type: ACTIVE_CHANNEL_UPDATE,
      })
      .catch(() => undefined);
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
