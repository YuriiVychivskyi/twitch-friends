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

  const announceChannel = () => {
    previousUrl = window.location.href;
    void sendChannelUpdate(parseTwitchChannel(previousUrl));
  };

  const updateChannel = () => {
    if (window.location.href === previousUrl) {
      return;
    }

    announceChannel();
  };

  const observer = new MutationObserver(updateChannel);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  window.addEventListener('popstate', updateChannel);
  window.addEventListener('focus', announceChannel);
  const announcementInterval = window.setInterval(announceChannel, 10_000);

  announceChannel();

  return () => {
    observer.disconnect();
    window.removeEventListener('popstate', updateChannel);
    window.removeEventListener('focus', announceChannel);
    window.clearInterval(announcementInterval);
  };
}
