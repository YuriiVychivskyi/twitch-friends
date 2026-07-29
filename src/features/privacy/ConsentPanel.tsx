import { useState } from 'react';
import { browser } from 'wxt/browser';

import { acceptPrivacyConsent, PRIVACY_CONSENT_ACCEPTED } from '@/features/privacy/privacyConsent';

type ConsentPanelProps = {
  onAccepted: () => void;
};

export function ConsentPanel({ onAccepted }: ConsentPanelProps) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const privacyUrl = browser.runtime.getURL('/privacy.html');
  const termsUrl = browser.runtime.getURL('/terms.html');

  const continueSetup = async () => {
    setBusy(true);

    try {
      await acceptPrivacyConsent();
      await browser.runtime.sendMessage({
        type: PRIVACY_CONSENT_ACCEPTED,
      });
      onAccepted();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="consent-panel" aria-labelledby="consent-title">
      <h2 className="consent-panel__title" id="consent-title">
        Before you continue
      </h2>
      <p className="consent-panel__text">
        Twitch Friends sends your Twitch profile, friend relationships, anonymous Firebase ID, and
        public encryption key to its backend. Your current channel is encrypted separately for
        accepted friends and expires shortly.
      </p>
      <p className="consent-panel__text">
        Viewing history and cookies are not collected. Twitch tokens are processed briefly for
        account verification, then revoked and never stored. Private keys stay on this device.
      </p>
      <div className="consent-panel__links">
        <a href={privacyUrl} rel="noreferrer" target="_blank">
          Privacy Notice
        </a>
        <a href={termsUrl} rel="noreferrer" target="_blank">
          Beta Terms
        </a>
      </div>
      <label className="consent-panel__check">
        <input
          checked={accepted}
          type="checkbox"
          onChange={(event) => setAccepted(event.target.checked)}
        />
        <span>I have read and accept the Privacy Notice and Beta Terms.</span>
      </label>
      <button
        className="consent-panel__button"
        disabled={!accepted || busy}
        type="button"
        onClick={() => void continueSetup()}
      >
        Continue
      </button>
    </section>
  );
}
