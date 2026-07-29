import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: ({ browser, command, manifestVersion }) => {
    const backendHosts = [
      ...(command === 'serve' ? ['http://127.0.0.1/*'] : []),
      'https://twitch-friends-api.yuravychivskii.workers.dev/*',
    ];

    return {
      name: 'Twitch Friends',
      description: 'Share your current Twitch stream with trusted friends.',
      icons: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png',
      },
      action: {
        default_icon: {
          16: 'icons/icon-16.png',
          32: 'icons/icon-32.png',
        },
      },
      permissions: manifestVersion === 2 ? ['storage', ...backendHosts] : ['storage'],
      ...(manifestVersion === 3
        ? {
            content_security_policy: {
              extension_pages: "script-src 'self'; object-src 'self';",
            },
            host_permissions: backendHosts,
          }
        : {
            content_security_policy: "script-src 'self'; object-src 'self';",
          }),
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
