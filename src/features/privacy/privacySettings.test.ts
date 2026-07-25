import { describe, expect, it } from 'vitest';

import { DEFAULT_PRIVACY_SETTINGS, parsePrivacySettings } from '@/features/privacy/privacySettings';

describe('privacy settings', () => {
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
});
