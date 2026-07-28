# Twitch Friends

A browser extension that adds a small friends section to the Twitch sidebar. The goal is to let
trusted friends share which live channel they are watching without collecting viewing history.

The project is currently in early development. The extension shell, Twitch sidebar mount, local
identity, Firebase emulator setup, and fail-closed database rules are working.

## Current state

- Chrome Manifest V3 and Firefox builds
- Local friends rendered in Twitch's sidebar
- Active Twitch channel detection across page navigation
- Anonymous Firebase authentication
- Local ECDH and ECDSA identity with non-extractable private keys
- Popup privacy control with presence sharing disabled by default
- Local friend storage with Twitch login validation
- Popup controls for adding and removing local friends
- Twitch user validation and profile images through a server-side function
- Twitch OAuth ownership verification for the user's own profile
- Firestore and Realtime Database rules that deny access by default
- Local Firebase Emulator Suite workflow

Friend invitations and live presence sharing are not implemented yet.

## Development

Requirements:

- Node.js 22 or newer
- npm 11 or newer
- Java 21 or newer for Firebase emulators

Install dependencies and start the local services:

```bash
npm install
npm run firebase:emulators
```

In a second terminal, start the extension:

```bash
npm run dev
```

For a static Chrome build:

```bash
npm run build
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select
`.output/chrome-mv3`.

## Commands

| Command                      | Purpose                                       |
| ---------------------------- | --------------------------------------------- |
| `npm run dev`                | Start Chrome development mode                 |
| `npm run dev:firefox`        | Start Firefox development mode                |
| `npm run check`              | Run formatting, linting, types, and tests     |
| `npm run build`              | Build the Chrome extension                    |
| `npm run build:firefox`      | Build the Firefox extension                   |
| `npm run firebase:emulators` | Start Auth, Firestore, and Database emulators |
| `npm run test:rules`         | Test Firebase security rules                  |

## Privacy

- The extension does not read Twitch cookies or credentials.
- Viewing history is not collected.
- Private identity keys are generated and stored locally.
- Firebase configuration contains public project identifiers, not server secrets.
- Database access stays closed until a tested data model is added.

See [docs/security-architecture.md](docs/security-architecture.md) for the current security model.

## Permissions

| Permission                                                      | Reason                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| `storage`                                                       | Store extension-owned settings                         |
| `https://www.twitch.tv/*`                                       | Add the friends section on Twitch                      |
| `http://127.0.0.1/*`                                            | Connect to Firebase emulators during local development |
| `https://europe-west1-demo-twitch-friends.cloudfunctions.net/*` | Call the Twitch backend                                |

## Environment

Copy `.env.example` to `.env`. Values prefixed with `WXT_PUBLIC_` are included in the extension
bundle and must never contain secrets.

Local development uses this OAuth callback:

```text
http://localhost:5001/demo-twitch-friends/europe-west1/twitchOAuthCallback
```

Add it to the Twitch app's OAuth Redirect URLs and to `oauthRedirectUris` in
`firebase/functions/.secret.local`. Production builds set
`WXT_PUBLIC_TWITCH_OAUTH_CALLBACK_URL` to the deployed HTTPS function URL.

The local secret uses this shape:

```json
TWITCH_API_CONFIG={"clientId":"...","clientSecret":"...","oauthRedirectUris":["http://localhost:5001/demo-twitch-friends/europe-west1/twitchOAuthCallback"]}
```

## Next steps

- Design mutual friend invitations
- Publish short-lived encrypted presence
- Add presence expiry and reconnect handling

Twitch Friends is an independent project and is not affiliated with Twitch Interactive, Inc.
