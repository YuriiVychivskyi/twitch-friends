import { browser } from 'wxt/browser';

import { startTwitchChannelDetection } from '@/features/presence/startTwitchChannelDetection';
import { isPrivacyConsentAccepted } from '@/features/privacy/privacyConsent';
import { startSidebar } from '@/features/sidebar/startSidebar';

export default defineContentScript({
  matches: ['https://www.twitch.tv/*'],
  runAt: 'document_idle',
  main(context) {
    let stopFeatures: (() => void) | null = null;

    const stop = () => {
      stopFeatures?.();
      stopFeatures = null;
    };

    const updateConsent = async () => {
      if (!(await isPrivacyConsentAccepted())) {
        stop();
        return;
      }

      if (stopFeatures) {
        return;
      }

      const stopChannelDetection = startTwitchChannelDetection();
      const stopSidebar = startSidebar();

      stopFeatures = () => {
        stopChannelDetection();
        stopSidebar();
      };
    };

    const handleStorageChange = (_changes: unknown, areaName: string) => {
      if (areaName === 'local') {
        void updateConsent();
      }
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    void updateConsent();

    context.onInvalidated(() => {
      browser.storage.onChanged.removeListener(handleStorageChange);
      stop();
    });
  },
});
