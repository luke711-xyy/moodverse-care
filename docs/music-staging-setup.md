# Moodverse Music MVP staging setup

The repository's existing `wrangler.toml` and `wrangler-cron.toml` belong to
the original `moodverse-care` Pages/Worker deployment and its production D1
database. Do not use them to publish this branch.

The isolated manifests are:

- `wrangler.music-staging.pages.toml` — Pages app `moodverse-music-staging`.
- `wrangler.music-staging-scheduler.toml` — scheduled Worker
  `moodverse-music-staging-scheduler`.

Both intentionally contain `REPLACE_WITH_STAGING_D1_DATABASE_ID`. Before any
deployment, create a separate D1 database named `moodverse-music-staging-db`,
replace that placeholder in both manifests with the new database ID, and
verify it is not the production ID in `wrangler.toml`. The D1 ID is a resource
identifier, not a secret; API tokens and authentication secrets remain in
Cloudflare Secrets.

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
