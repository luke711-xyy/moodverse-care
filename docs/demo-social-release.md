# Demo social release — 2026-10-10

## Objective and scope

Only the music D1 database `58d7ea1b-aaaf-4639-8adb-5fb2136dddf4` is in scope.
Production and staging share this database and its scheduler. Never use the
legacy root `wrangler.toml` to migrate or publish music.

Add an explicit demo registry, first-planet enrollment, two delayed jobs per new
real user, and a permanent once-per-pair greeting ledger. A registered actor must
still have its exact disabled-login identity marker at execution. Real-to-real
requests remain pending. Blocks, request preferences, public visibility, and
previous requests are checked again at delivery. No existing real users are
enrolled. Existing valid pending real-to-demo requests are accepted in bounded
batches. Existing friendships are not backfilled with greetings.

First invitation is due 5–15 minutes after creation; second is due 30–60 minutes.
The five-minute scheduler may add up to five minutes. Jobs terminate as sent or
skipped; they never re-invite declined/blocked users. Greeting and friendship
acceptance share one transaction. No message listener or automatic reply exists.

## Risks and plan

- Small additive tables and index only; no existing column or row is removed.
- Export a fresh D1 SQL backup before migration; keep it private outside Git.
- Read counts, registered-actor candidates, and foreign-key health first.
- Rehearse 0006 twice against a local SQLite import of that export; confirm
  unchanged planet, song, friendship, request, message, and moment counts.
- Apply only `migrations-music-staging/0006_demo_social.sql`, not every pending
  migration (historical migrations were applied outside the ledger).
- Verify registry provenance, no old-user enrollments, and foreign keys.
- Disable `MUSIC_DEMO_SEED_ENABLED` on the shared scheduler: its old per-user
  fixtures bypass this invitation lifecycle. Preserve existing fixture records.
- Publish scheduler with `wrangler.music-staging-scheduler.toml` and Pages with
  the music production config copied to a temporary release's `wrangler.toml`.
- Verify official domain assets, scheduler version/config, and no unexpected
  automation writes. Do not create real-user requests for a production smoke.

## Verification

Local tests cover two distinct actors and delay ranges, concurrency/replay,
blocks, rejection, preferences, private planets, ordinary-user isolation,
transaction failure rollback, re-friending without a second greeting, pending
request processing, and no replies to later messages. API tests cover both
acceptance directions. Production verification is read-only after migration.

## Rollback

1. Redeploy the previous Pages release (before demo-social feature), or set
   `MUSIC_DEMO_SOCIAL_ENABLED = "false"` in both production Pages variable
   sections and republish through a temporary release directory.
2. Set `MUSIC_DEMO_SOCIAL_ENABLED = "false"` in the shared scheduler config and
   deploy it using `npx wrangler deploy --config wrangler.music-staging-scheduler.toml`.
   Keep legacy demo seeding disabled.
3. Leave the four additive tables and all accepted friendships/messages intact.
   Do not restore the whole database or drop tables: that would discard user
   actions. Queued work remains dormant while the flag is off.
4. Correct forward and rerun targeted checks before re-enabling. Job and greeting
   identifiers make replay safe.

## Applied evidence

- Exported a private pre-migration SQL backup outside Git.
- Replayed the additive migration twice against that full export locally.
- Production migration completed in 9.3965 ms SQL time; 30 verified actors and
  30 distinct greetings. No foreign-key violations or invalid actor identities.
- Before/after counts unchanged: 44 planets, 112 selected tracks, 8 friendships,
  14 requests, 14 messages, 30 moments. Zero historical-user enrollments/jobs.
- 73 targeted social, planet, messaging, scheduler, and configuration tests pass.
- Additional prefixed-name registry regression passes; the final registry copy
  handles the existing `演示·` display-name prefix. Replayed and read back safely.
- 54 targeted CD picker and all-song matching tests pass after integration.
- Scheduler version `0779fb24-a932-47c1-8788-7fd50e3fe6ad` deployed with its
  five-minute trigger, new social flag on, and legacy seed flag off.
- Pages release `8d92f87f` published to the canonical production domain;
  HTML, entry assets, and music bundle returned 200 with exact local byte matches.
- No production user was created or sent an artificial test invitation/message.
- The enabled scheduler subsequently accepted six existing real-to-demo pending
  requests and created six once-only greeting records. This is requested feature
  behavior, not a test-message send or an old-friend greeting backfill.
