# ADR 0003 — Identity and authentication

- Status: Accepted
- Date: 2026-08-23

## Context

Solo and table play must work with **no account at all** — this is a hard
requirement, and it is what makes the app pleasant. But leagues and tournaments
need durable identity: standings that persist across rounds and seasons, results
attributable to a person, and an organiser who can be trusted with the bracket.

The user's instinct — passkeys, or a Slack-style email link, and never store
passwords — is correct. This ADR records how.

## Decision

**Three tiers of identity, each earning its cost.**

### Tier 0 — anonymous (default, and most of the app)

A random local `PlayerId` and a display name, held in `localStorage`. No
account, no network, no server contact of any kind. Solo play and P2P table play
never leave this tier.

### Tier 1 — table identity

The same local identity, shared over the data channel so peers can display a
name. Still no server. Still no account.

### Tier 2 — account (leagues and tournaments only)

Required only when a player joins an event whose organiser wants persistent
standings.

**Primary: passkeys (WebAuthn).** Registration and login via
`navigator.credentials`, implemented server-side with SimpleWebAuthn. There is no
password to store, phish, reuse, or leak. Discoverable credentials (resident
keys) let the user log in without typing anything — tap, Face ID, done, which is
the right experience at a game shop.

**Fallback: email magic link.** Necessary because passkeys still fail on shared
devices, some corporate-managed phones, and older browsers, and because a
recovery path is mandatory when a phone is lost. Rules:

- Single-use token, 15-minute expiry, invalidated on use.
- Store only a hash of the token, never the token itself.
- The link lands on a page that requires an explicit "Sign in" tap, so email
  scanners and link previewers cannot burn the token.
- Rate limit per email and per IP; constant-time comparison; no user enumeration
  in responses ("if that address has an account, we've sent a link" regardless).
- On successful login, offer to register a passkey, so the fallback is a
  bootstrap rather than a permanent mode.

**Explicitly not doing: passwords.** Not now, not as a fallback. There is no
version of storing password hashes that is better than the two options above.

**Social login (Google/Apple) is deferred, not rejected.** Apple Sign In becomes
effectively mandatory the moment we ship an iOS build with any other third-party
login, so revisit at Milestone 5.

### Sessions

Short-lived JWT access token in memory, refresh token in an `HttpOnly`,
`Secure`, `SameSite=Lax` cookie, rotated on use with reuse detection. Server-side
revocation list so "sign out everywhere" is real.

## Implementation

Cloudflare Workers + D1 for user records and credentials, Durable Objects for
rate limiting. Email via a transactional provider on a free tier (Resend,
Postmark, or SES). Verify current free-tier limits before launch.

## Consequences

- The auth code path is entirely absent from the solo and table bundles, so the
  common case pays nothing for it — not in bytes and not in latency.
- A stolen database yields public keys and email addresses. There is no
  credential in it that can be replayed anywhere.
- We accept the passkey ecosystem's rough edges (cross-device sync varies by
  platform, account recovery is genuinely harder) in exchange for eliminating
  the entire password threat class. The email fallback is the recovery path.
