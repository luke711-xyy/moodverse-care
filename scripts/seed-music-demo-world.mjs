import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const configPath = resolve(root, 'wrangler.music-staging.pages.toml')
const expected = [
  'name = "moodverse-music-staging"',
  'database_name = "moodverse-music-staging-db"',
  'database_id = "58d7ea1b-aaaf-4639-8adb-5fb2136dddf4"',
]

if (!process.argv.includes('--confirm-staging')) {
  console.error('Refusing to write. Run `npm run music:staging:seed-demo` to seed only the isolated staging D1 database.')
  process.exit(2)
}

const config = readFileSync(configPath, 'utf8')
if (!expected.every((value) => config.includes(value))) {
  console.error('Refusing to write: the isolated staging Pages/D1 config does not match its expected project and database.')
  process.exit(2)
}

const seedFiles = [
  'scripts/seed-music-demo-tracks.sql',
  'scripts/seed-music-demo-world.sql',
]

for (const relativePath of seedFiles) {
  const seedPath = resolve(root, relativePath)
  console.log(`Applying staging fixture: ${relativePath}`)
  const result = spawnSync('npx', [
    'wrangler', 'd1', 'execute', 'moodverse-music-staging-db', '--remote',
    '--config', configPath, '--file', seedPath,
  ], { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log('Demo music world seeded in moodverse-music-staging-db. Fictional demo users cannot log in; production was not touched.')
