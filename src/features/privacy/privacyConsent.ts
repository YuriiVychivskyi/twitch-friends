import { browser } from 'wxt/browser';

export const PRIVACY_CONSENT_ACCEPTED = 'privacy-consent:accepted';
export const PRIVACY_CONSENT_VERSION = '2026-07-29';

const PRIVACY_CONSENT_KEY = 'privacyConsentVersion';

export async function isPrivacyConsentAccepted() {
  const stored = await browser.storage.local.get(PRIVACY_CONSENT_KEY);

  return stored[PRIVACY_CONSENT_KEY] === PRIVACY_CONSENT_VERSION;
}

export async function acceptPrivacyConsent() {
  await browser.storage.local.set({
    [PRIVACY_CONSENT_KEY]: PRIVACY_CONSENT_VERSION,
  });
}

export function isPrivacyConsentAcceptedMessage(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as Record<string, unknown>;

  return Object.keys(message).length === 1 && message.type === PRIVACY_CONSENT_ACCEPTED;
}
