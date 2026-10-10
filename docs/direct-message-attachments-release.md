# Private message attachments release

## Scope and safety

The music production site and staging share `moodverse-music-staging-db`.
Use `wrangler.music-production.pages.toml`, never the legacy `wrangler.toml`.
This release adds one attachment table; no existing message or Orbit history is deleted.
Existing text rows retain their original schema and contents. Songs and photos use
plain-text placeholders in that table so an older client can still read them.

## Preflight

Read-only production check on 2026-10-10: 5 messages, no attachment table.
The migration ledger lists 0001 and 0002; later schema changes may have been
applied separately. Do not apply all outstanding migration files blindly.

## Release sequence

1. Exercise the additive schema in the isolated SQLite API test fixture.
2. Verify friendship/block checks, private image reads, strict size limits,
   failed-write cleanup and history pagination. No real-user test messages.
3. Apply only `migrations-music-staging/0005_direct_message_attachments.sql`
   to the music database. The statement is safe to re-run.
4. Verify the table definition, foreign-key integrity and unchanged message count.
5. Build and publish with the music production configuration in a temporary
   release directory. Verify the original production domain and its assets.

## Rollback

Redeploy the previous Pages release. Keep the additive attachment table and
stored objects; do not drop it or delete messages. Older clients show the
plain-text attachment placeholders. A later forward release can restore attachments.
Photo objects are private and accessible only through the authorized message route.

## Applied verification (2026-10-10)

- Only 0005 was applied to the music database; the legacy database was untouched.
- After migration: 5 existing messages, 0 attachments, no attachment foreign-key violations.
- Storage verification: the media bucket has its r2.dev public URL disabled and no custom domains.
- Isolated API checks cover participant-only photo access, hide/block/unfriend denial,
  strict 10 MiB rejection, MIME spoof rejection, transactional failure cleanup,
  catalog-backed songs and 123-message cursor history.
