# Music MVP staging migrations

The isolated staging D1 database starts from the current full schema in the
repository's `schema.sql`. Apply that baseline once to the newly created
staging database, then put only future incremental migrations in this folder.

Do not apply the legacy `migrations/` chain to a database initialized from
`schema.sql`: those files upgrade an older live schema and would repeat changes
already present in the baseline.
