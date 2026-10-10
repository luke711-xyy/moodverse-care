# Audius placeholder cleanup

This tool is offline: it reads a private SQL export and writes cleanup, rollback,
and audit-report files under `/tmp/mosic-*`. It never calls a provider, D1, or a
deployment API. Node 22 with `node:sqlite` is required.

## Scope

- Public example planets require both `owner_user_id LIKE 'demo:%'` and
  `visibility='public'`. Randomly shuffle those planets and eight default genres;
  genre counts differ by at most one. Each gets Cosmos plus two distinct cached,
  active Audius songs from its genre. One of those two Audius songs is primary.
- Other planets change only if they selected `provider='moodverse-demo'` songs.
  Remove those selections, retain every other song and its original metadata,
  and retain an existing primary. Promote the first retained song if necessary;
  add Cosmos only if no song remains. Private examples receive this same narrow
  cleanup, never the public-example reassignment.
- Keep historical song attribution untouched. Inspect every catalog foreign key:
  referenced fictional catalog entries become inactive historical demo entries;
  delete only entries with no remaining references. Never delete Cosmos.
- Rebuild visuals only for changed planets, preserve explicit overrides, advance
  `visual_revision`, and assign a new `visual_write_token` when those columns
  exist. No schema migration is introduced. Invalidate only query-cache entries
  that actually reference the fictional IDs.

## Generate and validate

Use a fresh export of music DB `58d7ea1b-aaaf-4639-8adb-5fb2136dddf4` with
`wrangler.music-production.pages.toml`. The production/staging apps share this
database. The repository's root `wrangler.toml` targets a different legacy DB.
Protect the export with mode 0600; never commit exports or generated SQL.

```sh
node_modules/.bin/esbuild scripts/migrate-music-audius.ts --bundle --platform=node --format=esm --outfile=/tmp/mosic-audius-migrate.mjs
node /tmp/mosic-audius-migrate.mjs /tmp/mosic-snapshot.sql /tmp/mosic-cleanup.sql
```

An optional third argument supplies a reproducible shuffle seed. The report
records the actual seed and every public-example assignment. Files are created
exclusively with mode 0600; choose a new output name if files already exist.

Generation runs the proposed changes on an in-memory copy, checks every foreign
key and each planet's one-to-five songs and exactly one primary, compares every
unmodified table including all social/history tables, independently executes the
generated cleanup SQL, executes its rollback, and checks exact restoration of
every original table. Generation fails before publishing any SQL on mismatch.

```sh
node_modules/.bin/esbuild tests/music-audius-cleanup.node.ts --bundle --platform=node --format=esm --outfile=/tmp/mosic-audius-cleanup-test.mjs
node --test /tmp/mosic-audius-cleanup-test.mjs
```

## Release and concurrency

Review the report and both SQL files. A separate authorized operator executes
the reviewed cleanup against the named music DB with the production config.
Do not execute both cleanup and rollback as part of release.

SQL stages narrow before/after values in a uniquely named `_music_cleanup_*`
table. These contain only affected planet rows, selections, fictional catalog
entries, selected true-song metadata, affected cache rows, and schema metadata;
they do not duplicate account/session tables. Each staging INSERT is small.
One trigger invocation then compares the exact expected row sets and executes
all business changes atomically, even if a CLI splits surrounding statements.
The comparison excludes SQLite physical `rootpage` values, which differ after
export/import. It includes affected selections, full planet rows, selected
catalog inputs, fake-ID reuse, and schema definitions. New historical references
to entries slated for deletion also abort the operation.
The exact D1 internal table `_cf_KV`, omitted by D1 exports, is excluded from
schema comparison and is never modified.

On `CLEANUP_CONFLICT`, no business changes from that invocation were made.
Export again, regenerate into new files, and review the new report. Do not bypass
the guard. A failed run may leave its uniquely named staging table/trigger;
inspect and drop only those exact objects. Successful execution drops both.

After release, re-export and check that fictional catalog rows are inactive or
absent, no selected songs reference them, public examples have three songs with
an Audius primary, all planet/FK checks pass, and historical/social rows retain
their original contents. The ordinary app smoke check is a separate release step.

## Rollback

Use the generated companion `.rollback.sql` with the same music DB/config. It
restores only the affected rows and checks the exact post-cleanup state first.
Unrelated new user content is preserved. If affected user music, visuals, catalog
metadata, or invalidated cache keys changed after cleanup, rollback refuses to
overwrite them; reconcile that newer state instead of bypassing the guard.

Production has a trigger that ignores legacy visual overwrites. Rollback restores
the previous schema marker before restoring the previous visual, both within the
same atomic invocation, while leaving that production protection trigger intact.

The guards are intentionally conservative: a metadata refresh for a chosen song
can require regenerating the release. Full exports and SQL files remain private
local recovery material and should be retained through release verification.
