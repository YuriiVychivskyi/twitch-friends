import { startSidebar } from '@/features/sidebar/startSidebar';

export default defineContentScript({
  matches: ['https://www.twitch.tv/*'],
  runAt: 'document_idle',
  main(context) {
    const stopSidebar = startSidebar();

    context.onInvalidated(stopSidebar);
  },
});
