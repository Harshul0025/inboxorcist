# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's **Report a vulnerability** button (Security → Advisories) on this repository rather than in a public issue. We aim to acknowledge reports within 72 hours.

## How Inboxorcist protects users

- **Least privilege.** Gmail access starts with `gmail.modify` only. `gmail.settings.basic` and `gmail.compose` are requested incrementally, the first time a player uses a feature that needs them.
- **Tokens stay in the browser.** The OAuth access token lives in memory only. It is never stored and never sent to our server.
- **Nothing is deleted.** The app never calls Gmail's trash or delete APIs. Every banished message carries a run label, so a run can always be undone.
- **Secrets are server-side.** The Gemini API key is read from the environment (Secret Manager on Cloud Run, encrypted environment variables on Vercel) and never reaches the client bundle.
- **Strict Content Security Policy.** A per-request nonce with `'strict-dynamic'`, no `unsafe-inline` or `unsafe-eval`, `object-src 'none'`, `frame-ancestors 'none'`, plus HSTS, `X-Frame-Options: DENY` and a restrictive `Permissions-Policy`.
- **Request hardening.** Zod validation on every endpoint, a 64 kB body limit, rate limiting, a same-origin guard for state-changing requests, and optional Firebase App Check.
- **SSRF protection.** One-click unsubscribe URLs must be HTTPS on the default port without credentials, and every DNS answer is checked against private and reserved ranges at connect time.
- **Prompt-injection hardening.** Email content is fenced as untrusted data, and model output is schema-validated, length-clamped and merged with a rulebook that can only make archiving more conservative.
- **Privacy-preserving logs.** Logs are structured JSON, and fields that could contain personal data are redacted.
- **Database rules.** Firebase Realtime Database rules restrict writes to the right player, validate every field, rate-cap taps and allow one vote per player. They are covered by emulator tests.

## Supported versions

Only the latest commit on `main` (the deployed version) is supported.
