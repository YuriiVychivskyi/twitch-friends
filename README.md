# Twitch Friends

A browser extension that adds a small friends section to the Twitch sidebar. Trusted friends can
share which live channel they are watching without collecting viewing history.

The project is being prepared for a closed beta. Friend requests, encrypted presence, Twitch OAuth
ownership verification, account cleanup, and the Twitch sidebar integration are working.

## Current state

- Chrome Manifest V3 and Firefox builds
- Twitch sidebar integration and active-channel detection across tabs
- Twitch OAuth ownership verification
- Friend requests with accept, decline, cancel, and remove actions
- End-to-end encrypted, short-lived presence between accepted friends
- Non-extractable local ECDH private keys
- Twitch profiles, friendship metadata, and public keys stored in Cloudflare D1
- Server-managed Realtime Database friendship cache derived only from Cloudflare D1
- Anonymous Firebase Authentication and Realtime Database presence delivery
- Popup actions for disconnecting Twitch and deleting account data
- First-run disclosure and versioned acceptance of the Privacy Notice and Beta Terms
- Exact extension-origin CORS, Firebase token verification, and bounded API rate limits
- Local Firebase Emulator Suite and Cloudflare Worker development workflow

## Architecture

The extension never receives a Twitch client secret, authorization code, access token, or refresh
token. Twitch OAuth and Helix requests run in a Cloudflare Worker. D1 stores account and friendship
metadata. Realtime Database carries only recipient-specific encrypted presence with a short expiry.
The matching private key remains in extension-owned IndexedDB.

See [docs/security-architecture.md](docs/security-architecture.md) for the full security model.

## Development

Requirements:

- Node.js 22 or newer
- npm 11 or newer
- Java 21 or newer for Firebase emulators

Install dependencies, copy `.env.example` to `.env`, and copy `.dev.vars.example` to `.dev.vars`.
Add the local Twitch client credentials only to `.dev.vars`; both local files are ignored by Git.

Start the local services in separate terminals:

```bash
npm install
npm run firebase:emulators
npm run worker:dev
npm run dev
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select
`.output/chrome-mv3`.

## Commands

| Command                          | Purpose                                        |
| -------------------------------- | ---------------------------------------------- |
| `npm run dev`                    | Start Chrome development mode                  |
| `npm run dev:firefox`            | Start Firefox development mode                 |
| `npm run check`                  | Run formatting, linting, types, and unit tests |
| `npm run test:rules`             | Test Firebase security rules                   |
| `npm run firebase:rules:check`   | Verify the production Rules target and hash    |
| `npm run firebase:rules:release` | Test and deploy production Database Rules      |
| `npm run firebase:rules:smoke`   | Test access against production Database Rules  |
| `npm run worker:build`           | Validate the production Worker bundle          |
| `npm run worker:dev`             | Start the local Worker and D1                  |
| `npm run worker:migrate:local`   | Apply local D1 migrations                      |
| `npm run worker:migrate:remote`  | Apply production D1 migrations                 |
| `npm run build`                  | Build the Chrome extension                     |
| `npm run build:firefox`          | Build the Firefox extension                    |
| `npm run firebase:emulators`     | Start Auth, Firestore, and Database emulators  |

## Privacy

- The extension does not read Twitch cookies, credentials, or page storage.
- Channel detection, Firebase, and backend services do not start until the user accepts the in-product disclosure.
- The extension does not use cookies; consent covers the required local storage and data processing.
- Viewing history is not collected.
- Twitch tokens are revoked after ownership verification and are never persisted.
- Private identity keys are generated and stored locally.
- Presence is encrypted separately for every accepted friend.
- Presence records expire after one minute and are not retained as history.
- **Disconnect Twitch** removes the profile, friendships, requests, public key, and presence.
- **Delete my data** also deletes the Firebase identity and local extension data.

## Permissions

| Permission                                                | Reason                            |
| --------------------------------------------------------- | --------------------------------- |
| `storage`                                                 | Store extension-owned settings    |
| `https://www.twitch.tv/*`                                 | Add the friends section on Twitch |
| `http://127.0.0.1/*` (development builds only)            | Reach local emulators and Worker  |
| `https://twitch-friends-api.yuravychivskii.workers.dev/*` | Reach the production API          |

## Production

The Worker uses encrypted Cloudflare secrets named `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and
`FIREBASE_ADMIN_CONFIG`. The Firebase secret contains only `clientEmail`, `privateKey`, and the exact
production `databaseUrl`. Never place these values in a `WXT_PUBLIC_` variable, extension bundle,
Wrangler config, README, issue, or commit.

The exact production Twitch OAuth redirect URL is:

```text
https://twitch-friends-api.yuravychivskii.workers.dev/oauth/callback
```

Apply migrations and deploy with:

```bash
npm run worker:migrate:remote
npm run worker:deploy
```

Firebase production uses Anonymous Authentication and Realtime Database only. Firestore remains
fail-closed. Firebase Functions and a Firebase billing plan are not required.

For a release that locks friendship writes, deploy the Worker first, update all beta installations,
then run `npm run firebase:rules:release`. The command tests the rules, deploys them only to the fixed
`twitch-friends-2ea03` production project, and runs an authenticated production access smoke-check.

## Closed beta

The closed beta targets Chrome. The Firefox build remains compile-tested, but its per-install random
moz-extension:// origin is not included in the production CORS allowlist yet.

Beta access will be provided to approved testers. Feedback and bug reports are welcome through the
contact options below.

## Roadmap

### v0.1.2

- Batch encrypted presence updates into one Firebase request for all friends.
- Support offline, online on Twitch without watching a channel, and watching-a-channel states.
- Style online and offline labels like Twitch category metadata with muted text and a lighter font weight.
- Keep the existing purple channel link when a friend is watching a stream.
- Keep backend refreshes within the existing request limits.
- Update consent, privacy information, and the store description for online presence sharing.

### v0.2.0

- Add a Twitch Friends button and panel to the Twitch top navigation.
- Show the number of active friends on the Twitch navigation button.
- Show incoming friend request notifications together with the full Twitch panel.
- Move Twitch profile, friends, requests, account controls, and settings into the Twitch panel.
- Keep the browser popup focused on security and runtime status.
- Localize the extension based on the Twitch interface language, with English as the fallback.

## Policies

- [Privacy Notice](public/privacy.html)
- [Beta Terms](public/terms.html)

## Contact

- Twitch: [LIVAY1337](https://www.twitch.tv/livay1337)
- Telegram: [@vychivsky](https://t.me/vychivsky)
- Email: [yuravychivskii@gmail.com](mailto:yuravychivskii@gmail.com)

Twitch Friends is an independent project and is not affiliated with Twitch Interactive, Inc.
