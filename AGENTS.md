# Music demo development

## Delivery pace

- The user prefers fast implementation and deployment, then hands-on feedback.
- For ordinary UI changes, run the production build and a short, relevant smoke
  check. Do not routinely run the full suite, perform multi-device screenshot
  rounds, or request independent reviews.
- Use targeted extra checks when changing permissions, data integrity, database
  migrations, or irreversible operations. Never claim unrun tests passed.

## Publication

- The current official site is https://moodverse-care.pages.dev.
- Publish the music app with `wrangler.music-production.pages.toml`, copied as
  `wrangler.toml` in a temporary release directory for Pages deployments.
- The music production and staging sites currently share the existing music D1
  database and scheduler. Staging writes therefore affect the same music data.
- The repository's original `wrangler.toml` is the legacy emotional product's
  database configuration. Do not use it to publish the music version or mutate
  that legacy database.
- Keep heavy images/models out of Git. Commit only changes relevant to the task.
