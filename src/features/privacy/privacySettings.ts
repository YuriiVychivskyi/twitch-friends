import { browser } from 'wxt/browser';

export type PrivacySettings = {
  sharePresence: boolean;
  version: 1;
};

const PRIVACY_SETTINGS_KEY = 'privacy-settings';

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  sharePresence: false,
  version: 1,
};

export function parsePrivacySettings(value: unknown): PrivacySettings {
  if (!value || typeof value !== 'object') {
    return DEFAULT_PRIVACY_SETTINGS;
  }

  const settings = value as Record<string, unknown>;

  if (settings.version !== 1 || typeof settings.sharePresence !== 'boolean') {
    return DEFAULT_PRIVACY_SETTINGS;
  }

  return {
    sharePresence: settings.sharePresence,
    version: 1,
  };
}

export async function getPrivacySettings() {
  const stored = await browser.storage.local.get(PRIVACY_SETTINGS_KEY);

  return parsePrivacySettings(stored[PRIVACY_SETTINGS_KEY]);
}

export async function setPresenceSharingEnabled(sharePresence: boolean) {
  const settings: PrivacySettings = {
    sharePresence,
    version: 1,
  };

  await browser.storage.local.set({
    [PRIVACY_SETTINGS_KEY]: settings,
  });

  return settings;
}
