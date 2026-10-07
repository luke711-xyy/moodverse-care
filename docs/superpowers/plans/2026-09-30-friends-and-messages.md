# Music MVP Friend Requests and Direct Messages Plan

> **For agentic workers:** Execute this plan inline, task by task. Each task uses a failing test before implementation. The existing branch contains unrelated in-progress work; do not stage or commit files outside the task.

**Goal:** Complete the authenticated friendship and text-message backend contract required by the Music MVP, with server-enforced privacy, refusal, and block behavior.

**Architecture:** Additive D1 tables store social preferences, directional friend-request state, user blocks, and per-user-hidden direct messages. Pages Functions resolve every target from database-owned planet/user relationships, and authorize messages only while a friendship exists and neither side has blocked the other. Existing Orbit remains the read model for accepted friends.

**Tech Stack:** TypeScript, Cloudflare Pages Functions, D1/SQLite, Vitest, Node 22 `node:sqlite` integration fixture.

**Spec:** Feishu “Moodverse 音乐偶遇 MVP｜产品与工程改造说明书”, revision 44, sections 2.6–2.7, 2.10, 4.1 and 5.

## Global Constraints

- Friend requests may be initiated from any public planet; friendship exists only after recipient acceptance.
- A user can disable incoming friend requests. A rejected request cannot be resent by the same requester; blocking also removes an existing friendship and pending requests.
- Direct messages are text-only and available only to current friends; a block or friendship removal immediately denies further reads and writes.
- Do not return email addresses, private planet fields, private Moments, or internal auth tokens in social responses.
- All mutation ownership, visibility, block, and friendship checks are server-side; each migration is additive and mirrors `schema.sql`.
- Blocked pairs must be absent from Galaxy, Song Portal, random roam, Orbit, direct public reads, and visit writes.

## Review Focus

- Duplicate, reversed, rejected, concurrent, and self-directed friend requests must not create duplicate or unauthorized friendships.
- Request preference changes and blocks must take effect at the server boundary, not only in the UI.
- Message IDs, peer IDs, and request IDs supplied by the client must not cross user boundaries.
- Read state and per-user message hiding must not expose one participant’s private history to another.
- A friendship removed or blocked during an open conversation must make the next request fail closed.

---

### Task 1: Social preferences, friend requests, and blocks

**Files:**
- Create: `migrations/0012_music_social.sql`
- Modify: `schema.sql`, `tests/helpers/music-api-fixture.ts`, `tests/music-schema.test.ts`
- Create: `functions/api/me/social-settings.ts`
- Create: `functions/api/me/friend-requests.ts`
- Create: `functions/api/me/friend-requests/[id].ts`
- Create: `functions/api/me/blocks.ts`
- Create: `functions/api/me/blocks/[userId].ts`
- Create: `functions/api/me/friends/[userId].ts`
- Test: `tests/music-friend-api.test.ts`

**Interface:** `GET/PATCH /api/me/social-settings` reads and changes the account’s `allowFriendRequests` flag. `GET/POST /api/me/friend-requests` lists pending requests and creates a request using a public `planetId`. `PATCH /api/me/friend-requests/:id` accepts or rejects a request addressed to the caller. `DELETE /api/me/friends/:userId` removes a mutual friendship. `GET/POST /api/me/blocks` lists or creates a block using a public `planetId`; `DELETE /api/me/blocks/:userId` unblocks. Acceptance inserts the canonical pair in `music_friendships` atomically with request state. Blocking deletes the friendship and both directions of pending requests.

- [x] Write failing route and SQLite tests for default-on/disabled request preference, public-only and non-self requests, one request per directed pair, refusal lockout, recipient-only accept/reject, canonical friendship insertion, block/unblock and cleanup.
- [x] Run `npm test -- tests/music-friend-api.test.ts` and confirm route/module failures.
- [x] Add additive constraints and minimal route handlers with stable error codes and bounded response payloads.
- [x] Run focused tests, `npm test -- tests/music-schema.test.ts`, `npm run typecheck`.

### Task 2: Friend-only direct messages

**Files:**
- Modify: `migrations/0012_music_social.sql`, `schema.sql`, `tests/helpers/music-api-fixture.ts`, `tests/music-schema.test.ts`
- Create: `functions/api/me/friends/[userId]/messages.ts`
- Create: `functions/api/me/messages/[id].ts`
- Test: `tests/music-direct-message-api.test.ts`

**Interface:** `GET/POST /api/me/friends/:userId/messages` reads the latest 100 messages (marking incoming messages read) or sends one bounded text message. `DELETE /api/me/messages/:id` hides a message only for the caller. Every operation requires an active friendship and no block in either direction.

- [x] Write failing SQLite API tests for non-friend denial, reciprocal friend access, bounded non-empty text, read/unread state, per-user hide, and denial immediately after unfriend/block.
- [x] Run `npm test -- tests/music-direct-message-api.test.ts` and confirm the route/module failures.
- [x] Implement the message rows, pagination bounds, server-side authorization, and hidden/read state.
- [x] Run focused tests, the full suite, typecheck, and build.

### Task 3: Enforce block visibility across discovery and visits

**Files:**
- Modify: `functions/api/music/discovery.ts`, `functions/api/music/galaxy.ts`, `functions/api/music/song-portal.ts`, `functions/api/music/planets/[id].ts`, `functions/api/music/planets/[id]/visit.ts`, `functions/api/me/orbit.ts`
- Modify: matching existing API tests

- [x] Add failing two-identity tests that a block in either direction removes candidates from all discovery/Orbit reads and rejects direct reads/visits.
- [x] Run each focused API test and confirm the leak or unauthorized write before changing production code.
- [x] Add reusable SQL predicates or helper logic without altering exact-song candidate rules or incognito visit semantics.
- [x] Run full tests, typecheck, build, and `git diff --check`.

### Task 4: User-facing friendship and messaging path

**Files:**
- Modify: `src/music-api.ts`, `src/music/MusicApp.tsx`, `src/music/music-app.css`
- Modify: `tests/music-api.test.ts`, `tests/music-app.test.tsx`

- [x] Add failing UI tests for requesting friendship from a visited public planet, viewing/responding to incoming requests, opening a friend conversation, unread/read display, sending text, and server denial after a block.
- [x] Implement the API client methods and preserve the current dark music-first interface and narrow-screen behavior.
- [x] Run focused UI/API-client tests, full tests, typecheck, build, and diff checks.

### Task 5: Server-enforced content reports

**Files:**
- Create: `migrations/0014_music_content_reports.sql`
- Modify: `schema.sql`, `tests/helpers/music-api-fixture.ts`, `tests/music-schema.test.ts`
- Create: `functions/api/me/reports.ts`
- Test: `tests/music-content-report-api.test.ts`

**Interface:** `POST /api/me/reports` accepts one of `planet`, `moment`, `drift_bottle`, `drift_comment`, or `direct_message`, plus a bounded reason/detail. The server verifies that the reporter is allowed to know and report the target; it never returns target-private content. Reports are immutable, unique per reporter/target, and limited to five per user per UTC day. Report rows do not foreign-key the target so moderation evidence survives content/account removal; reporter deletion cascades.

- [x] Write failing SQLite-backed tests for unauthenticated requests, exact input validation, public-only planets/Moments, participant-only bottle/comment/message reports, self-report rejection, duplicate reports, and the daily limit.
- [x] Run `npm test -- tests/music-content-report-api.test.ts` and confirm the missing route/schema behavior.
- [x] Add the additive migration, schema mirror, and minimal authenticated handler with database-atomic quota enforcement and bounded response payloads.
- [x] Run focused report and schema tests, the full suite, typecheck, build, and `git diff --check`.

### Task 6: User-facing report affordances

**Files:**
- Modify: `src/music-api.ts`, `src/music/MusicApp.tsx`, `src/music/music-app.css`
- Modify: `tests/music-api.test.ts`, `tests/music-app.test.tsx`

**Interface:** Provide a small, reusable “举报” interaction for a visited public planet and its Moments, received drift-bottle content/comments, and incoming DMs. The user selects a bounded reason and may add a short detail; successful submission confirms receipt without implying a moderation decision. Do not add report buttons to owned content or outgoing DMs.

- [x] Write failing API-client and UI tests for reporting public Moments and received social content, validation feedback, and success state.
- [x] Run focused tests and confirm the report client/UI affordance is absent.
- [x] Add the report API client and contextual form controls while preserving the existing responsive visual language.
- [x] Run focused UI/client tests, the full suite, typecheck, build, and `git diff --check`.

### Task 7: User-facing privacy and receiving settings

**Files:**
- Modify: `src/music-api.ts`, `src/music/MusicApp.tsx`, `src/music/music-app.css`
- Modify: `tests/music-api.test.ts`, `tests/music-app.test.tsx`

**Interface:** Add an authenticated Settings view reachable from connected navigation. It lets the owner change their planet's Galaxy visibility, whether they accept friend requests, and whether they accept drift bottles. It also lets the owner change each Moment's visitor visibility. Read current server preferences when opening the view; only reflect a mutation after the server confirms it, and preserve the last confirmed state while showing a recoverable error on failure. Keep logout available. Account deletion/data processing controls and moderation triage remain separate until their policies and operator requirements are specified.

- [x] Write failing API-client tests for reading/updating social preferences, planet visibility, and individual Moment visibility; write UI tests for settings navigation, loading server state, successful mutation, and failure preserving the confirmed value.
- [x] Run focused tests and confirm the missing client/UI behavior.
- [x] Add the settings client methods and responsive Settings view with explicit loading/saving/error states.
- [x] Run focused UI/client tests, the full suite, typecheck, build, and `git diff --check`.

### Task 8: Isolate private UI state across account changes

**Files:**
- Modify: `src/music/MusicApp.tsx`
- Modify: `tests/music-app.test.tsx`

**Interface:** On logout and every successful OTP identity transition, clear account-owned drafts, navigation state, settings, Orbit/friend data, visits, and conversations before loading the next account. Async reads and writes started under the prior identity must not repopulate the new account's UI after completion.

- [x] Add a regression test that opens a private DM as account A, logs out, authenticates as account B in the same mounted SPA, and verifies A's DM and Orbit contacts are absent.
- [x] Confirm the regression against the existing UI before the fix.
- [x] Reset account-scoped state at identity boundaries and guard async state updates with a local session generation.
- [x] Run focused tests, the full suite, typecheck, build, and `git diff --check`.

### Task 9: Preserve Moment settings read failures

**Files:**
- Modify: `src/music/MusicApp.tsx`
- Modify: `tests/music-app.test.tsx`

**Interface:** A failed Moment fetch must not be rendered as an empty list. Show an explicit read error and retry action in Settings; after a successful retry, display server-confirmed Moment visibility controls.

- [x] Add a regression test for a failed initial Moment fetch followed by a successful retry.
- [x] Track the Moment load error separately from the successfully loaded empty-list state.
- [x] Render a retryable error instead of the “no Moments” empty state while the read is unresolved.
- [x] Run focused tests, the full suite, typecheck, build, and `git diff --check`.

### Task 10: Propagate auth changes across open tabs

**Files:**
- Modify: `src/music/MusicApp.tsx`
- Modify: `tests/music-app.test.tsx`

**Interface:** A logout or successful OTP login in one tab notifies other open Moodverse tabs. Each receiving tab clears account-scoped state and reloads the shared server session. Publish through both `BroadcastChannel` and a non-sensitive storage-event signal so tabs with mixed browser capabilities still synchronize; deduplicate by event ID and never place credentials or private content in the signal.

- [x] Add a test that simulates an external tab's logout/login signals while this tab has a cached private conversation.
- [x] Confirm the test fails without a cross-tab listener.
- [x] Broadcast session transitions over both transports, deduplicate events, and reset/reload receiving tabs.
- [x] Run focused tests, the full suite, typecheck, build, and `git diff --check`; assert local storage and BroadcastChannel publish the identical session-change payload; obtain final independent review.

### Post-plan follow-up: Keep bottle retries independent from care-card generation

- [x] Add a regression test where hourly care-card generation fails while an unread bottle is due; confirm the old scheduler skipped bottle expiry and re-routing.
- [x] Run the drift-bottle API/scheduler tests and verify the bottle is expired and assigned to the next eligible recipient even though the care-card error still surfaces to the scheduled Worker.
- [x] Run full TypeScript tests (42 files / 257 tests), typecheck, build, and `git diff --check`.

### Post-plan follow-up: Add moderator-only report triage API

- [x] Add SQLite-backed tests for a default-closed reviewer allowlist, bounded report queue, private target-content exclusion, same-origin transitions, and review audit metadata.
- [x] Add an additive `music_report_reviews` migration and match it in `schema.sql` and API fixtures.
- [x] Add moderator-email-gated list/status APIs; status changes are atomic, only permit forward transitions, and never automatically delete or expose target content.
- [x] Document staging-only reviewer configuration and the current manual triage boundary.
- [x] Run local whole-branch verification: `npm test -- --maxWorkers=1` (43 files / 269 tests), `npm run typecheck`, `npm run build`, and `git diff --check` all pass.
- [x] Simulate unavailable WebGL2 in the local browser at desktop and 390×844 viewport sizes; the retryable scene fallback stays visible while song selection and My Orbit remain usable.
- [ ] Complete real multi-account triage acceptance in isolated staging. Current `music:staging:preflight` is blocked because the D1 database ID is missing, invalid, or a placeholder; do not create or alter Cloudflare resources to bypass this.

## Completion Boundary

This plan covers friend requests, accepted friendships, blocking, text DMs, user-facing privacy/receiving settings, server-side reporting, and the moderator-only report queue/status API. A dedicated reviewer console and Cloudflare staging reliability still need end-to-end acceptance. Drift-bottle expiry/re-routing has only local scheduler coverage; account deletion/data processing needs isolated multi-account acceptance. Completion of this plan is not completion of the overall product goal.
