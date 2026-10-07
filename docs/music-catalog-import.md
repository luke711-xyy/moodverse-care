# Curated music catalog import

The API migration creates an empty catalog. Before onboarding users, the team must provide a curated JSON file whose track metadata, cover image, and official playback links have an approved source. This importer does not scrape QQ Music, verify licensing, contact external services, or write to D1.

## Input shape

Use a versioned file with 1–500 records per import:

```json
{
  "version": 1,
  "tracks": [
    {
      "id": "provider:canonical-track-id",
      "title": "Song title",
      "artistId": "canonical-artist-id",
      "artistName": "Artist",
      "versionLabel": "Studio version",
      "genres": ["ambient"],
      "moodTags": ["calm"],
      "provider": "approved-provider",
      "providerTrackId": "provider-track-id",
      "officialUrl": "https://official.example/track/provider-track-id",
      "coverUrl": "https://official.example/cover/provider-track-id.jpg",
      "durationSeconds": 212,
      "isActive": true
    }
  ]
}
```

`id` is the stable Moodverse track ID. Keep different recordings, remasters, live versions, and covers as different IDs. `provider` plus `providerTrackId` must also be unique. `versionLabel`, `genres`, `moodTags`, `coverUrl`, and `durationSeconds` are optional; active status defaults to `true`. `officialUrl` is required. URLs must use HTTPS and may not embed credentials. Validate that each URL is actually the approved provider's official destination before import; HTTPS syntax alone does not prove rights or official ownership.

## Generate and review SQL

```sh
node scripts/music-catalog-import.mjs ./music-catalog.json > ./music-catalog-import.sql
```

The command validates IDs, duplicates, field sizes, tag types, duration values, and URLs before emitting one idempotent SQLite upsert statement. It preserves the original `created_at` on updates. It never connects to Cloudflare or executes SQL. Review the generated SQL and apply it only to the intended staging D1 database; do not point an unreviewed import at production. To retire a track, import the same stable ID with `isActive: false`; do not delete it, because planets and Moments may still reference it.

Production/approved catalog entries must come from the team's approved source.
For isolated staging tests only, `scripts/seed-music-demo-tracks.sql` contains
fictional, explicitly non-playable examples (`provider = moodverse-demo`, IDs
prefixed with `demo:` and blank official URLs). The UI marks them as demo rows;
they do not establish licensing, playback, catalog approval, or real-song match
facts. Never run that seed against production.
