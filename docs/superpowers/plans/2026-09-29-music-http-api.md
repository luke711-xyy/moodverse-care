# Moodverse Music Core HTTP API Implementation Plan

> **For agentic workers:** Execute this plan inline, task by task. Every task begins with a failing test and ends with the recorded verification command.

**Goal:** Deliver Cloudflare-identity-backed catalog discovery, one persistent music planet per user, private/public Moments, and a permission-correct public planet projection.

**Architecture:** Cloudflare Email Service Email Sending delivers sign-in codes; it is not an identity provider. Moodverse Pages Functions issue, verify, and consume one-time codes, then create revocable app sessions in D1. Music MVP requests authenticate with the app-issued `mv_music_session` cookie. Legacy Cloudflare Access assertions are not a public login path and are ignored unless an explicitly enabled private migration environment sets `MUSIC_ALLOW_LEGACY_ACCESS_AUTH=true`; verified email sign-in can link a single unambiguous legacy Access identity. Existing anonymous `mv_session` behavior remains for legacy endpoints and never authorizes music MVP writes. D1 remains the authority for ownership and visibility.

**Tech Stack:** TypeScript, Cloudflare Pages Functions, D1/SQLite, Cloudflare Email Service REST API, Vitest, Node 22 `node:sqlite` for integration-style API tests, Web Crypto for OTP/session hashing and signatures.

**Spec:** [Moodverse 音乐偶遇 MVP｜产品与工程改造说明书](https://zcngcaimq8jy.feishu.cn/docx/SKsOdC1BsovVkYxXRh3cK6vInVg), current revision 45, sections 2.1–2.4 and 4.1.

## Global Constraints

- Cloudflare Email Service is a mail-delivery provider; the application owns OTP and session security. Production requires an onboarded sender domain and a narrowly scoped Email Sending API token. Cloudflare documents Email Sending as beta and arbitrary-recipient sending as a Workers Paid capability; verify current account eligibility before rollout.
- Codes are single-use, six-digit, expire after ten minutes, and are HMAC-digested at rest. Rate-limit by normalized email and source IP, invalidate the prior challenge on resend, prevent enumeration, and require same-origin writes.
- Resolve app ownership from a verified, normalized email session—not a client-provided user ID or legacy anonymous cookie. A verified email can link to exactly one pre-existing Access identity; ambiguous links fail closed.
- Direct Access assertion auth is disabled by default. The opt-in is limited to private migration environments and must never become the public sign-in path. The legacy `users.token_hash` field is non-null, so email-only users receive an unguessable, never-issued placeholder hash; it is not an authentication credential and must never be returned to a client.
- The catalog uses stable canonical track IDs; creation requires exactly 3 tracks; later active selection has 1–5.
- A user owns one persistent music planet. Changing selected tracks does not change its identity or history.
- A music planet defaults public; users may set it private. Moment visibility is per item and defaults public. Owners may read their private Moments; visitors may only read public Moments on a public planet. A private planet is absent from public access and discovery.
- All ownership, visibility, track eligibility, and writes are checked by the server; UI hiding is not authorization.
- Official playback links are metadata only. Do not embed full audio or claim playback/recognition licensing.
- The local AI gateway, user-facing login configuration, demo account seeding, client screens, legacy journal migration, and production deployment remain separate later slices.

## Review Focus

- Missing, malformed, expired, replayed, or incorrect codes never create or resolve an app user; a valid code is consumed once and yields a secure, revocable session.
- Repeated email sign-ins resolve to the same internal user ID; ambiguous legacy email matches fail without merging accounts.
- Duplicate or whitespace-equivalent IDs cannot consume multiple song slots; a missing or inactive catalog track cannot be selected.
- A failed multi-track update leaves the previous selection intact.
- Private Moments and private planets cannot leak through public reads; mutation routes cannot cross owner boundaries.

---

### Task 1: Cloudflare Email Service OTP identity and D1 test fixture

**Files:**
- Reuse: `migrations/0008_music_access_identity.sql` (legacy identity-to-email bridge only)
- Create: `migrations/0011_music_email_auth.sql`
- Modify: `schema.sql`
- Modify: `functions/_shared.ts`, `functions/_music-email-auth.ts`
- Create: `functions/api/auth/email/request.ts`, `functions/api/auth/email/verify.ts`, `functions/api/auth/logout.ts`
- Create: `tests/helpers/music-api-fixture.ts`
- Create: `tests/music-email-auth-api.test.ts`
- Modify: `tests/music-schema.test.ts` (apply the email-auth migration before comparing the full schema mirror)

**Interface:** `/api/auth/email/request` sends a code through Cloudflare Email Sending; `/api/auth/email/verify` consumes it and issues the secure app cookie; `/api/auth/logout` revokes the session. `authenticatedMusicUser(request, env)` resolves only a valid app email session by default. A verified email may reuse an unambiguous legacy Access identity row to preserve owner IDs; the Access map is not itself a public login provider. The SQLite test fixture exercises actual D1 queries and stubs the email transport without contacting Cloudflare.

- [x] Write failing tests for malformed/expired/replayed codes, same-origin enforcement, rate limits, delivery failures, enumeration resistance, secure session creation/revocation, stable email identity mapping, and Access assertions being rejected by default.
- [x] Run `npm test -- tests/music-email-auth-api.test.ts` and confirm the expected missing/incorrect auth behavior.
- [x] Add the additive email identity/session tables, Cloudflare Email Sending adapter, OTP verification, and SQLite D1 test fixture. Keep legacy `session()` separate and make direct Access fallback opt-in only.
- [x] Run `npm test -- tests/music-email-auth-api.test.ts`; invalid codes and disabled legacy Access assertions must fail before creating/resolving a user.
- [x] Included in aggregate current-version commit `8803556`, pushed to `origin/codex/music-hackathon-mvp`.

### Task 2: Catalog read endpoint

**Files:**
- Create: `tests/music-catalog-api.test.ts`
- Create: `functions/api/music/catalog.ts`
- Modify: `src/music-domain.ts` (shared `MusicTrackSummary` response contract)
- Reuse: `tests/helpers/music-api-fixture.ts`

**Interface:** `GET /api/music/catalog?q=<optional text>` returns `{ tracks: MusicTrackSummary[] }` with stable IDs and official playback URLs; only active catalog rows are selectable. This read endpoint does not create an account or mutate data.

- [x] Add tests for active-only listing, literal search over title/artist, field mapping, and no write side effects.
- [x] Verify `GET /api/music/catalog` is implemented with bound parameters and does not return internal ingestion metadata.
- [x] Run `npm test -- tests/music-catalog-api.test.ts` (3 tests passed).
- [x] Included in aggregate current-version commit `8803556`, pushed to `origin/codex/music-hackathon-mvp`.

### Task 3: Owned music planet creation and updates

**Files:**
- Create: `tests/music-planet-api.test.ts`
- Create: `functions/api/me/music-planet.ts`
- Create: `tests/helpers/cloudflare-access-jwt.ts` (signed Access assertions for owner-route integration tests)
- Reuse: `src/music-domain.ts`, `tests/helpers/music-api-fixture.ts`

**Interface:** `GET/POST/PATCH /api/me/music-planet`; every method requires a verified Moodverse email session. GET returns the owner's planet and ordered selected tracks; POST creates the first planet; PATCH updates profile/visibility and/or active tracks without replacing planet identity. The shared API test fixture may opt into legacy Access compatibility only for tests that specifically exercise that migration path.

- [x] Add tests for no-current-planet GET, exactly-three creation, public default, explicit private creation, invalid count/duplicate/unknown/inactive track rejection, one planet per owner, 1–5 updates, primary-track validation, identity isolation, and preservation of planet ID/creation history.
- [x] Verify the route validates the authenticated session and catalog IDs, updates ordered links atomically, defaults primary track, rejects invalid primary IDs, and maps uniqueness conflicts to stable errors.
- [x] Run `npm test -- tests/music-planet-api.test.ts` (8 tests passed).
- [x] Included in aggregate current-version commit `8803556`, pushed to `origin/codex/music-hackathon-mvp`.

### Task 4: Moment APIs and public planet projection

**Files:**
- Create: `tests/music-moment-api.test.ts`
- Create: `functions/api/me/music-planet/moments.ts`
- Create: `functions/api/me/music-planet/moments/[id].ts`
- Create: `functions/api/music/planets/[id].ts`
- Reuse: `tests/helpers/music-api-fixture.ts`

**Interface:** Owner `GET/POST /api/me/music-planet/moments` and `PATCH/DELETE /api/me/music-planet/moments/:id` require a verified Moodverse email session. Visitor `GET /api/music/planets/:id` returns only data the viewer is allowed to read; anonymous requests may read only active public planet fields and public Moments. Owner private reads remain on `/api/me/...` routes.

- [x] Add tests for public-by-default Moments, explicit private Moments, owner/visitor visibility, private planet not-found behavior, invalid track IDs, and owner-isolated edits/deletes.
- [x] Verify mutations enforce ownership and public projection filters both planet and Moment visibility at read time.
- [x] Run `npm test -- tests/music-moment-api.test.ts` (8 tests passed).
- [x] Run the full suite and build after the current changes: `npm test` (39 files / 228 tests), `npm run typecheck`, `npm run build`; `git diff --check` is clean.
- [x] Included in aggregate current-version commit `8803556`, pushed to `origin/codex/music-hackathon-mvp`.

### Task 5: Reviewed controlled catalog import

**Files:**
- Create: `scripts/music-catalog-import.mjs`
- Create: `tests/music-catalog-import.test.ts`
- Create: `docs/music-catalog-import.md`

**Interface:** Accept a versioned JSON catalog, validate stable canonical IDs, provider ID uniqueness, metadata bounds, and credential-free HTTPS links; emit an idempotent SQL upsert to stdout. Do not include fabricated songs, scrape a provider, contact a remote database, or execute generated SQL.

- [x] Write failing tests for defaults, malformed records/URLs, duplicate keys, injection-safe SQL output, idempotent updates, and no database/network side effects.
- [x] Run `npm test -- tests/music-catalog-import.test.ts` and confirm the importer module is missing.
- [x] Implement the validator and SQL generator; preserve original creation time and use `is_active = 0` instead of deleting catalog rows.
- [x] Run focused tests, the full suite, typecheck, build, and `git diff --check`.
- [x] Included in aggregate current-version commit `8803556`, pushed to `origin/codex/music-hackathon-mvp`.

## Completion Boundary

This plan establishes Cloudflare Email Service OTP and real D1-backed data contracts, not a complete end-user MVP. Email Sending setup requires a verified sender domain, an appropriately scoped API token, and an eligible Cloudflare plan; keep account IDs in variables and credentials in server-side Secrets. Continue with demo onboarding, the AI Composer vertical slice, UI, social features, and a reversible migration/staging rollout; do not claim launch readiness or deploy to the existing Moodverse production domain.

### Task 6: Clearly identify a real staging demo account

**Files:**
- Modify: `functions/_shared.ts`, `functions/api/me/music-planet.ts`
- Modify: `src/music-api.ts`, `src/music/MusicApp.tsx`, `src/music/music-app.css`
- Modify: `tests/music-planet-api.test.ts`, `tests/music-api.test.ts`, `tests/music-app.test.tsx`
- Modify: `docs/music-email-auth-setup.md`

**Interface:** An optional Preview/staging `MUSIC_DEMO_EMAIL` marks the matching already-authenticated email identity in the owner's private home response. The API returns only a boolean, and the UI clearly labels the active account. It does not create a user, add test content, or bypass OTP.

- [x] Add failing route and UI tests for normalized exact-email matching, ordinary accounts, no email disclosure, and the visible demo badge.
- [x] Confirm the tests fail because the account flag and UI marker are missing.
- [x] Implement an environment-gated boolean account marker and document Preview-only setup with no synthetic interactions.
- [x] Run focused API, client, and UI tests (`36/36`), full tests (`39 files / 236 tests`), typecheck, build, and `git diff --check`.

### Task 7: Let owners manage planet identity and selected songs

**Files:**
- Modify: `src/music-api.ts`, `src/music/MusicApp.tsx`, `src/music/music-app.css`
- Modify: `tests/music-app.test.tsx`

**Interface:** Settings can update a planet's display name and tagline, add or remove songs within the existing 1–5 post-creation range, and select one active song as the primary song. The server-confirmed planet remains authoritative; failed updates retain the last confirmed state. Track changes use the existing owner-only PATCH API and trigger the existing visual-composition refresh when queued.

- [x] Add a failing settings interaction test covering profile edits, reaching five selected songs, selecting a primary song, and protecting the final remaining song.
- [x] Implement accessible settings controls and send only changed track-selection fields, preserving the API's stable primary/selection semantics.
- [x] Run focused app/API tests (`37/37`), full tests (`39 files / 237 tests`), typecheck, build, and `git diff --check`.
- [x] Included in aggregate current-version commit `8803556`, pushed to `origin/codex/music-hackathon-mvp`.

### Post-plan follow-up: Bound Cloudflare Email Service latency

- [x] Add a regression test proving a stalled Email Sending request receives an abort signal, returns the existing safe delivery error, and invalidates the OTP challenge.
- [x] Abort the provider fetch after 10 seconds and always clear the timeout when fetch or response parsing finishes.
- [x] Verify against the official Cloudflare REST API that the endpoint, Bearer auth, request fields, and `delivered` / `queued` acceptance fields match the current documented contract.
