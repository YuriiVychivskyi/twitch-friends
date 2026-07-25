import { startTwitchChannelDetection } from '@/features/presence/startTwitchChannelDetection';
import { startSidebar } from '@/features/sidebar/startSidebar';

export default defineContentScript({
  matches: ['https://www.twitch.tv/*'],
  runAt: 'document_idle',
  main(context) {
    const stopChannelDetection = startTwitchChannelDetection();
    const stopSidebar = startSidebar();

    context.onInvalidated(() => {
      stopChannelDetection();
      stopSidebar();
    });
  },
});
