# Security Architecture

## Objectives

- Keep Twitch and backend credentials out of the extension bundle.
- Keep private cryptographic identity material on the user's device.
- Avoid collecting or retaining viewing history.
- Restrict every remote read and write to the smallest required path.
- Reject access by default and bound unauthenticated and authenticated work.
- Support complete server and local data cleanup.
- Require a prominent in-product disclosure before starting remote data services.

## Trust boundaries

| Boundary                   | Trust                                         |
| -------------------------- | --------------------------------------------- |
| Twitch page                | Untrusted                                     |
| Content script             | Restricted presentation and stream detection  |
| Extension background       | Trusted network and cryptography boundary     |
| Extension IndexedDB        | Private non-extractable key storage           |
| Extension local storage    | Local preferences and derived display state   |
| Firebase Auth              | Installation identity provider                |
| Firebase Realtime Database | Untrusted for plaintext presence              |
| Cloudflare Worker          | Trusted API and OAuth boundary                |
| Cloudflare D1              | Server-only account and friendship metadata   |
| Twitch OAuth and Helix     | Account ownership and public profile provider |

## Data placement

| Data                        | Location                         | Retention                       |
| --------------------------- | -------------------------------- | ------------------------------- |
| Private ECDH key            | Extension IndexedDB              | Until Delete my data            |
| Local settings and UI cache | Extension local storage          | Until disconnect or deletion    |
| Privacy consent version     | Extension local storage          | Until deletion or policy update |
| Firebase installation UID   | Firebase Authentication          | Until Delete my data            |
| Twitch profile mapping      | Cloudflare D1                    | Until disconnect or deletion    |
| Friend requests/friendships | Cloudflare D1                    | Until removal or deletion       |
| Public ECDH key             | Cloudflare D1                    | Until disconnect or deletion    |
| OAuth state                 | Cloudflare D1, SHA-256 hash only | Single use, ten-minute expiry   |
| Rate-limit counters         | Cloudflare D1                    | Bounded keys and daily counters |
| Current viewing presence    | Realtime Database, encrypted     | Approximately one minute        |
| Viewing history             | Nowhere                          | Never created                   |

## Consent and disclosure

On first run, the popup prominently describes the Twitch profile, anonymous identifier, friendship,
public-key, and encrypted-presence processing. Firebase Authentication and backend requests do not
start until the user explicitly checks acceptance and continues. Acceptance is stored with a policy
version so a future material policy change can require consent again.

Channel detection, sidebar injection, Firebase Authentication, and backend requests remain disabled
until acceptance. The extension does not use cookies. The disclosure covers extension local storage, IndexedDB, and
remote processing. Privacy Notice and Beta Terms pages are bundled locally and remain available from
the popup after acceptance.

## Identity and authentication

Firebase Anonymous Authentication provides an installation-scoped UID without email or password
registration. The Worker accepts only Firebase ID tokens signed by Google for the exact production
project, with the anonymous sign-in provider. Signature keys are cached according to Google's
cache headers and refreshed once when a new key ID appears.

A reinstall creates a new Firebase UID. Reconnecting the same Twitch account updates the D1 mapping
to the new UID while retaining Twitch-ID-based relationships. The client republishes its public key,
and the Worker rebuilds the derived Realtime Database friendship cache from D1.

The emulator-only unsigned-token path requires both `ALLOW_INSECURE_EMULATOR_AUTH=true` and a
`demo-` Firebase project ID. That variable is absent from production configuration.

## Twitch OAuth

The Worker creates a cryptographically random 256-bit state value. Only its SHA-256 hash is stored,
bound to the initiating Firebase UID, single-use, and valid for ten minutes. The callback URL is an
exact HTTPS value configured in Wrangler and Twitch Developer Console.

Authorization codes are exchanged only in the Worker. The returned access token is validated
against Twitch, including the expected client ID and user ID. Twitch profile data is then fetched
through Helix. Access and refresh tokens are revoked in a `finally` block and are never written to
D1, logs, extension storage, or responses.

## Friend metadata

D1 is bound directly to the Worker and is not accessible from the extension. API calls require a
valid Firebase bearer token. Users can read only their own profile, requests, and friendship view;
mutations are derived from the authenticated UID rather than a client-supplied owner ID.

D1 is the only friendship source of truth. Clients cannot write the Realtime Database friendship
cache. The Worker synchronizes affected nodes after mutations and presence refreshes, and its daily
reconciliation replaces the complete cache so unknown or stale edges are removed. Both D1 checks and
a database trigger cap accepted friendships at 100 per account.

Database uniqueness constraints prevent one Twitch account, login, or Firebase UID from owning
multiple mappings. Foreign keys cascade profile deletion through requests, friendships, and public
keys.

## Presence

The background generates a non-extractable P-256 ECDH private key. Only the public key is uploaded.
The current channel is encrypted independently for every accepted friend before it reaches Firebase.
The ciphertext is authenticated, versioned, schema-limited, and expires locally and in database
rules.

Realtime Database rules require reciprocal friendship edges before a sender can write a recipient
mailbox. A recipient may read and clear only their own mailbox. A sender may delete only their own
outbound records. All other paths deny reads and writes.

The client refreshes active presence every 30 seconds, applies a three-second publish debounce, and
uses the short encrypted expiry to tolerate Manifest V3 service-worker suspension. Explicit account
and channel cleanup removes active records. It never persists plaintext viewing history.

## API controls

- CORS uses the exact production Chrome extension origin.
- If Chrome omits `Origin` on an extension request, a runtime-generated extension-origin header is
  accepted only when the standard `Origin` is absent or `null`; a hostile non-null `Origin` cannot
  be overridden.
- CORS is defense in depth; authentication and authorization do not depend on Origin alone.
- Request bodies are streamed and rejected above 4 KiB.
- Network calls to Twitch have ten-second timeouts.
- OAuth starts are limited per installation and address, with an additional ten-second cooldown.
- API operations have separate hourly installation and address limits.
- Accepted authenticated API work has a 10,000-request daily service budget.
- Public OAuth callbacks have an independent per-address limit and cannot consume that budget.
- Rate-limit keys reset in place instead of growing once per hour.
- A daily Worker cron deletes expired rate-limit/OAuth rows and old daily counters, then reconciles
  the complete derived Firebase friendship cache with D1.
- Cloudflare Workers and D1 are deployed on the free plan; Firebase Functions are not used.
- API and OAuth responses disable caching and never expose internal exception details.

## Browser isolation

- Firebase, Worker API calls, and cryptography run in the extension background context.
- The Twitch page never receives Firebase tokens, public keys, ciphertext, or private keys.
- The content script never reads cookies, Twitch local storage, authentication tokens, or private
  Twitch APIs.
- Remote scripts, dynamic code execution, analytics, advertising SDKs, and session replay are not
  included.
- Extension pages use `script-src 'self'; object-src 'self'` Content Security Policy.

## Data lifecycle

**Disconnect Twitch** deletes the D1 profile mapping, friendships, requests, public key, OAuth state,
and both directions of active Realtime Database presence. Local UI storage is cleared. The anonymous
Firebase UID and private key remain available for a later reconnect.

**Delete my data** performs the same server cleanup, deletes the Firebase Authentication UID, clears
extension storage, and deletes the identity IndexedDB database. A local setup-required flag prevents
a replacement anonymous account from being created until the user explicitly connects again.

## Release gates

- Formatting, lint, TypeScript, unit tests, Worker tests, and Firebase Rules tests must pass.
- Chrome and Firefox production builds must complete.
- The Worker dry-run bundle must complete without configuration warnings.
- Production dependencies must have no known high or critical vulnerabilities.
- Twitch secrets must exist only in Cloudflare encrypted secrets and ignored local development files.
- Production Realtime Database rules must match the tested repository version.
- The committed Rules hash and fixed production project alias must pass `firebase:rules:check`.
- The post-deploy production smoke-check must confirm own-cache read access while foreign reads and
  client friendship writes remain denied.
- The Twitch Developer Console must contain only exact required OAuth redirect URLs.
- The extension package must be inspected to confirm it contains no secrets or source maps with
  sensitive local data.
