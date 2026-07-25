# Twitch Friends

[![Release channel](https://img.shields.io/badge/release-beta-9147ff)](#roadmap)
[![WXT](https://img.shields.io/badge/WXT-0.20-646cff)](https://wxt.dev)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6)](https://www.typescriptlang.org)

Twitch Friends is a private, opt-in browser extension that brings friend presence back to
Twitch. Trusted friends will be able to share which live channel they are currently watching
and view each other's presence directly from Twitch.

> The project is in active beta development. The extension foundation is ready, while friend
> presence and Twitch sidebar integration are planned for the first beta release.

## Product

Twitch Friends is designed for small, trusted groups. Every user controls whether their current
viewing activity is shared. Friend relationships are mutual, presence is temporary, and viewing
history is not retained.

```text
Twitch tab
   │
   ├── Detect active stream
   │
   ├── Publish temporary presence
   │
   └── Render trusted friends in the Twitch sidebar
```

## Status

| Capability                        | Status    | Target |
| --------------------------------- | --------- | ------ |
| Chrome Manifest V3 foundation     | Available | `0.1`  |
| Firefox build foundation          | Available | `0.1`  |
| Extension popup                   | Available | `0.1`  |
| Local settings and friend storage | Planned   | Beta 1 |
| Twitch SPA and player detection   | Planned   | Beta 1 |
| Twitch sidebar integration        | Planned   | Beta 1 |
| Mutual friend invitations         | Planned   | Beta 2 |
| Realtime presence relay           | Planned   | Beta 2 |
| Presence expiry and reconnect     | Planned   | Beta 2 |
| End-to-end encrypted presence     | Planned   | Beta 3 |

## Architecture

| Area           | Responsibility                                                            |
| -------------- | ------------------------------------------------------------------------- |
| Content script | Detect Twitch navigation, observe playback, and mount isolated sidebar UI |
| Background     | Coordinate extension lifecycle, presence, and browser messaging           |
| Popup          | Manage identity, friends, privacy, and connection state                   |
| Local storage  | Store user settings, friend records, and cryptographic identity           |
| Relay          | Forward short-lived encrypted presence between connected friends          |

The relay will not be the source of truth for friend data or viewing history. Friend records and
private identity remain extension-owned local data.

## Privacy

- Presence sharing is disabled until explicitly enabled.
- Friend access requires mutual confirmation.
- Presence expires automatically when heartbeats stop.
- Viewing history is not stored.
- Relay payloads will be end-to-end encrypted.
- No Twitch credentials or session cookies are accessed.

## Technology

| Tool       | Purpose                                                 |
| ---------- | ------------------------------------------------------- |
| WXT        | Cross-browser extension tooling and manifest generation |
| React      | Popup and injected interface                            |
| TypeScript | Strict application contracts                            |
| ESLint     | Type-aware static analysis                              |
| Prettier   | Deterministic formatting                                |

## Development

### Requirements

- Node.js 22 or newer
- npm 11 or newer

### Setup

```bash
npm install
npm run dev
```

### Commands

| Command                 | Description                                |
| ----------------------- | ------------------------------------------ |
| `npm run dev`           | Start Chrome development mode              |
| `npm run dev:firefox`   | Start Firefox development mode             |
| `npm run check`         | Run formatting, linting, and type checking |
| `npm run build`         | Build Chrome production output             |
| `npm run build:firefox` | Build Firefox production output            |
| `npm run zip`           | Package the Chrome extension               |
| `npm run zip:firefox`   | Package the Firefox extension              |

## Project structure

```text
src/
  entrypoints/
    background.ts
    content.ts
    popup/
eslint.config.js
tsconfig.json
wxt.config.ts
```

Generated browser artifacts are written to `.output/`.

## Permissions

| Permission                | Reason                                         |
| ------------------------- | ---------------------------------------------- |
| `storage`                 | Store extension-owned settings and friend data |
| `https://www.twitch.tv/*` | Run the content script on Twitch pages         |

New permissions must be documented before being added.

## Environment

```env
WXT_PUBLIC_RELAY_URL=ws://localhost:8787
```

Runtime-exposed configuration must use the `WXT_PUBLIC_` prefix. Secrets must never be included
in extension environment variables or browser bundles.

## Roadmap

| Release | Scope                                                                 |
| ------- | --------------------------------------------------------------------- |
| Beta 1  | Local identity, friends, player detection, and Twitch sidebar UI      |
| Beta 2  | Invitations, realtime relay, heartbeat, expiry, and reconnect         |
| Beta 3  | End-to-end encryption, privacy controls, and cross-browser validation |
| `1.0`   | Stable protocol, polished onboarding, packaging, and release workflow |

## Disclaimer

Twitch Friends is an independent project and is not affiliated with, endorsed by, or sponsored
by Twitch Interactive, Inc.
