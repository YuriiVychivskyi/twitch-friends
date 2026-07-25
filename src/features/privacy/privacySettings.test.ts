import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: storage,
    },
  },
}));

import {
  DEFAULT_PRIVACY_SETTINGS,
  getPrivacySettings,
  parsePrivacySettings,
  setPresenceSharingEnabled,
} from '@/features/privacy/privacySettings';

describe('privacy settings', () => {
  beforeEach(() => {
    storage.get.mockReset();
    storage.set.mockReset();
  });

  it('keeps presence sharing disabled by default', () => {
    expect(parsePrivacySettings(undefined)).toEqual(DEFAULT_PRIVACY_SETTINGS);
    expect(parsePrivacySettings({ sharePresence: true })).toEqual(DEFAULT_PRIVACY_SETTINGS);
    expect(parsePrivacySettings({ sharePresence: 'true', version: 1 })).toEqual(
      DEFAULT_PRIVACY_SETTINGS,
    );
  });

  it('accepts a supported settings record', () => {
    expect(parsePrivacySettings({ sharePresence: true, version: 1 })).toEqual({
      sharePresence: true,
      version: 1,
    });
  });

  it('reads privacy settings from extension storage', async () => {
    storage.get.mockResolvedValue({
      'privacy-settings': {
        sharePresence: true,
        version: 1,
      },
    });

    await expect(getPrivacySettings()).resolves.toEqual({
      sharePresence: true,
      version: 1,
    });
    expect(storage.get).toHaveBeenCalledWith('privacy-settings');
  });

  it('writes an explicit presence preference', async () => {
    storage.set.mockResolvedValue(undefined);

    await expect(setPresenceSharingEnabled(true)).resolves.toEqual({
      sharePresence: true,
      version: 1,
    });
    expect(storage.set).toHaveBeenCalledWith({
      'privacy-settings': {
        sharePresence: true,
        version: 1,
      },
    });
  });
});
