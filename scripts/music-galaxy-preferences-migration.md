# Migration 0004: Galaxy artist and song candidate pools

## Objective and scope

Add `music_galaxy_selection_preferences` in music D1 database
`58d7ea1b-aaaf-4639-8adb-5fb2136dddf4`. Production and staging share it.
Existing genre preferences, tracks, planets and users are not rewritten.
The legacy root Wrangler database must not be used.

## Risks and plan

This is an additive, empty-table creation, with no backfill or table scan.
SQLite schema locking is brief; no downtime is expected. Do not apply all historical
migrations: apply this exact file using the music production configuration.

1. Read schema and existing genre preference count.
2. Export a fresh private backup outside Git; import into local SQLite.
3. Run migration twice locally; verify old data unchanged and no foreign-key violations.
4. Apply `migrations-music-staging/0004_galaxy_selection_preferences.sql` remotely
   with `--config wrangler.music-production.pages.toml`.
5. Verify new table, zero initial selections and unchanged genre count.
6. Deploy the music app using the production config in a temporary release directory.
7. Check live preferences, catalog choices, and eight-node limit.

## Rollback

Redeploy the previous music release. Keep the new table and all saved candidate pools;
old code does not reference it. Do not drop the table or restore the entire database
over newer user activity. No data rollback is needed for this additive migration.
