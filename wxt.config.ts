import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: ({ browser, manifestVersion }) => {
    const localFirebaseHosts = ['http://127.0.0.1/*'];

    return {
      name: 'Twitch Friends',
      description: 'Share your current Twitch stream with trusted friends.',
      permissions: manifestVersion === 2 ? ['storage', ...localFirebaseHosts] : ['storage'],
      ...(manifestVersion === 3
        ? {
            host_permissions: localFirebaseHosts,
          }
        : {}),
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
    };
  },
});
