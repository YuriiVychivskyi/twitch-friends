# Security Architecture

## Objectives

- Prevent Twitch, Firebase, and unrelated extensions from receiving plaintext viewing activity.
- Keep private identity material on the user's device.
- Avoid retaining viewing history.
- Restrict every remote read and write to the smallest required path.
- Reject access by default.
- Keep production credentials and administrative capabilities out of the extension bundle.

## Trust boundaries

| Boundary                   | Trust                                         |
| -------------------------- | --------------------------------------------- |
| Twitch page                | Untrusted                                     |
| Content script             | Restricted presentation and stream detection  |
| Extension background       | Trusted network and cryptography boundary     |
| Extension IndexedDB        | Trusted local key storage                     |
| Extension local storage    | Trusted local preferences and friend metadata |
| Firebase client services   | Untrusted for plaintext presence              |
| Firebase Admin environment | Administrative and never bundled              |
| Twitch OAuth callback      | Trusted one-time identity verification        |

## Data placement

| Data                       | Location                | Remote representation         |
| -------------------------- | ----------------------- | ----------------------------- |
| Private cryptographic keys | Extension IndexedDB     | Never uploaded                |
| Local privacy settings     | Extension local storage | Never uploaded                |
| Local friend labels        | Extension local storage | Never uploaded                |
| Public identity keys       | Cloud Firestore         | Public key material only      |
| Mutual friend grants       | Cloud Firestore         | Member identifiers and state  |
| Invitations                | Cloud Firestore         | Random identifiers and expiry |
| Current viewing presence   | Realtime Database       | End-to-end encrypted payload  |
| Viewing history            | Nowhere                 | Never created                 |

## Identity

Firebase Anonymous Authentication provides an installation-scoped UID without Twitch, email, or
password registration. Reinstalling the extension or clearing its storage creates a new identity
and requires pairing again.

Twitch account ownership is verified through a server-side authorization-code callback. The
extension receives neither the authorization code nor Twitch tokens. OAuth state values are random,
single-use, short-lived, stored only as SHA-256 hashes, and bound to the initiating Firebase UID.
User and refresh tokens are revoked after verification and are never persisted.

The extension generates non-extractable Web Crypto keys and stores them in extension-owned
IndexedDB. Only public key material may leave the device.

## Presence

The background context owns the Firebase connection. Twitch content scripts send only the minimal
current-channel state to the background context. Decrypted friend presence is reduced to the
minimum display model before it reaches the sidebar UI.

Presence records contain ciphertext, an initialization vector, a protocol version, and expiry
metadata. They do not contain a plaintext Twitch channel, display name, URL, title, category, or
viewing history.

Realtime Database handles connection state and removes presence using `onDisconnect`. Clients also
reject expired payloads locally.

## Remote access

- Firebase Security Rules deny access by default.
- Authentication alone never grants collection-wide access.
- A user may write only to their own identity or authorized recipient mailbox.
- A user may read only their own records and explicitly granted friend records.
- Payload schemas, field counts, string lengths, and timestamps are validated in rules.
- Administrative credentials are restricted to trusted backend environments.
- Firebase API keys identify the project and are not treated as authorization.
- Twitch profile lookups are limited per authenticated installation.

## Browser isolation

- Firebase and cryptographic operations run only in the extension background context.
- The Twitch page never receives Firebase Auth tokens, public identity records, or private keys.
- The content script never reads Twitch cookies, local storage, authentication tokens, or private
  APIs.
- Remote scripts and dynamic code execution are prohibited.
- Analytics, advertising SDKs, session replay, and remote console logging are prohibited.
- Production logs exclude identifiers, channels, ciphertext, tokens, and key material.

## Firebase projects

- Development uses the `demo-twitch-friends` Emulator Suite project.
- Production uses a dedicated Firebase project with no unrelated applications.
- Firestore uses a European location.
- Realtime Database uses `europe-west1`.
- Development and production never share databases or credentials.

## Release gates

- Automated rules tests cover allowed and denied operations.
- Every rule change includes a negative test.
- Emulator tests pass before any rules deployment.
- Production App Check enforcement is evaluated separately and never replaces Security Rules.
- Quotas, API restrictions, billing alerts, and usage monitoring are configured before beta access.
- A privacy notice documents metadata visible to Firebase and the absence of viewing-history
  retention.
