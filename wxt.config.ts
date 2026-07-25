import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: ({ browser }) => ({
    name: 'Twitch Friends',
    description: 'Share your current Twitch stream with trusted friends.',
    permissions: ['storage'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'twitch-friends@example.local',
              strict_min_version: '140.0',
              data_collection_permissions: {
                required: ['none'],
              },
            },
          },
        }
      : {}),
  }),
});
