import { browser } from 'wxt/browser';

const ACCOUNT_SETUP_REQUIRED_KEY = 'accountSetupRequired';

export async function isAccountSetupRequired() {
  const stored = await browser.storage.local.get(ACCOUNT_SETUP_REQUIRED_KEY);

  return stored[ACCOUNT_SETUP_REQUIRED_KEY] === true;
}

export async function enableAccountSetup() {
  await browser.storage.local.remove(ACCOUNT_SETUP_REQUIRED_KEY);
}

export async function requireAccountSetup() {
  await browser.storage.local.set({
    [ACCOUNT_SETUP_REQUIRED_KEY]: true,
  });
}
