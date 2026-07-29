import { beforeEach, describe, expect, it, vi } from 'vitest';

const storedConsent = vi.hoisted<{ value: unknown }>(() => ({ value: undefined }));

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn((key: string) => Promise.resolve({ [key]: storedConsent.value })),
        set: vi.fn((value: Record<string, unknown>) => {
          storedConsent.value = Object.values(value)[0];
          return Promise.resolve();
        }),
      },
    },
  },
}));

import {
  acceptPrivacyConsent,
  isPrivacyConsentAccepted,
  isPrivacyConsentAcceptedMessage,
  PRIVACY_CONSENT_ACCEPTED,
} from '@/features/privacy/privacyConsent';

describe('privacy consent', () => {
  beforeEach(() => {
    storedConsent.value = undefined;
  });

  it('requires the current consent version before data services start', async () => {
    await expect(isPrivacyConsentAccepted()).resolves.toBe(false);

    await acceptPrivacyConsent();

    await expect(isPrivacyConsentAccepted()).resolves.toBe(true);
  });

  it('accepts only the exact background notification', () => {
    expect(isPrivacyConsentAcceptedMessage({ type: PRIVACY_CONSENT_ACCEPTED })).toBe(true);
    expect(isPrivacyConsentAcceptedMessage({ type: PRIVACY_CONSENT_ACCEPTED, extra: true })).toBe(
      false,
    );
  });
});
