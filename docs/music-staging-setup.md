# Moodverse Music MVP staging setup

The repository's existing `wrangler.toml` and `wrangler-cron.toml` belong to
the original `moodverse-care` Pages/Worker deployment and its production D1
database. Do not use them to publish this branch.

The isolated manifests are:

- `wrangler.music-staging.pages.toml` — Pages app `moodverse-music-staging`.
- `wrangler.music-staging-scheduler.toml` — scheduled Worker
  `moodverse-music-staging-scheduler`.

Both manifests now target the isolated D1 database `moodverse-music-staging-db`
(`58d7ea1b-aaaf-4639-8adb-5fb2136dddf4`). The ID is a resource identifier, not
a secret; API tokens and authentication secrets remain in Cloudflare Secrets.
Verify both manifests still use this same ID and that it differs from the
production ID in `wrangler.toml` before future deployment work.

## Initialize the isolated database

The current `schema.sql` is a complete, data-free schema snapshot for a new
database. The numbered files in `migrations/` are an incremental upgrade chain
for an older Moodverse schema, so applying that directory to a blank staging
database is not safe. Bootstrap the new D1 database from `schema.sql`:

```sh
npx wrangler d1 execute moodverse-music-staging-db \
  --remote --config wrangler.music-staging.pages.toml \
  --file ./schema.sql
```

Keep future staging-only schema changes in `migrations-music-staging/`; both
staging manifests point at this same migration directory and D1 database.
Do not add the already-applied `schema.sql` baseline as a second migration.
Validate the resulting tables and indexes before deploying either Worker.

## Seed fictional tracks for staging tests

The isolated staging catalog can be populated with six clearly identified
fictional rows while no approved catalog source or provider API is available.
They are labeled `moodverse-demo`, use IDs prefixed with `demo:`, and have no
playable/official URL. The UI labels them as non-playable demo data. Apply only
to the dedicated staging database:

```sh
npx wrangler d1 execute moodverse-music-staging-db \
  --remote --config wrangler.music-staging.pages.toml \
  --file ./scripts/seed-music-demo-tracks.sql
```

This seed is idempotent. Do not include it in `schema.sql`, the production
migration chain, or any production database. Replace it only after approved
catalog entries and official destinations are available.

## Seed a full demo world

The isolated staging scheduler also seeds a synthetic social test world on its
first scheduled run while `MUSIC_DEMO_SEED_ENABLED` is true. It creates 12
clearly labeled planets (10 public and 2 private), overlapping demo-track
selections, public/private Moments, and per-real-account fixture actors for
Orbit, song encounters, visits (including hidden visits), friendship requests,
friends and DMs, six daily-roam entries, and an unread commented/liked drift
bottle. Synthetic `demo:*` identities cannot sign in; personal activity is
attached to an existing real staging music account without copying private
content. The SQL is idempotent and lives in `scripts/` so the private scheduler
can load it through its Assets binding.

For a manual staging-only run when Wrangler's D1 SQL endpoint is available, use
`npm run music:staging:seed-demo`. It verifies the exact staging project and D1
IDs before applying the fictional track and world fixtures.

## Deploy only after external setup

1. Create the Pages project and the separate scheduled Worker in the Cloudflare
   account; create the staging D1 database and configure its ID in both files.
2. Apply the schema baseline above, then configure the Pages Email Service and
   Moodverse AI gateway Secrets using the linked setup guides.
3. Build the app and run `npm run music:staging:preflight`. It must pass before
   any deployment; it fails closed while either manifest has a placeholder ID,
   the manifests point at different databases, or either target is production.
4. Deploy the Pages app with
   `npx wrangler pages deploy dist --config wrangler.music-staging.pages.toml --branch staging`.
5. Deploy the cron Worker with
   `npx wrangler deploy --config wrangler.music-staging-scheduler.toml`.
6. Confirm in Cloudflare that the Worker has the `*/5 * * * *` Cron Trigger and
   that its D1 binding targets the same staging database as Pages. A five-minute
   poll means unread bottles are re-routed at the first run after their one-hour
   expiry, with at most one poll interval of scheduling delay.

No Cloudflare resources, secrets, or deployments were created by adding these
templates. Finish the setup only against the isolated staging project; the
production manifests remain untouched.

Related setup: [email OTP](music-email-auth-setup.md) and
[local AI gateway](music-ai-gateway-setup.md).
