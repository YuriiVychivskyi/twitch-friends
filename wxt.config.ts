import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: ({ browser, manifestVersion }) => {
    const firebaseHosts = [
      'http://127.0.0.1/*',
      'https://europe-west1-demo-twitch-friends.cloudfunctions.net/*',
    ];

    return {
      name: 'Twitch Friends',
      description: 'Share your current Twitch stream with trusted friends.',
      permissions: manifestVersion === 2 ? ['storage', ...firebaseHosts] : ['storage'],
      ...(manifestVersion === 3
        ? {
            host_permissions: firebaseHosts,
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
