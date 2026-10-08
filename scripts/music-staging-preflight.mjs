import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const databaseIdPattern = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i

function configValue(source, key) {
  return source.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'))?.[1] ?? null
}

function configBlock(source, heading) {
  const lines = source.split(/\r?\n/)
  const headerIndex = lines.findIndex(line => line.trim() === heading)
  if (headerIndex < 0) return null
  let endIndex = headerIndex + 1
  while (endIndex < lines.length && !lines[endIndex].trim().startsWith('[')) endIndex += 1
  return lines.slice(headerIndex + 1, endIndex).join('\n')
}

/**
 * Inspect only public deployment-manifest values; this function never reads secrets or contacts Cloudflare.
 * @param {string} pagesSource
 * @param {string} schedulerSource
 * @param {string | null} productionDatabaseId
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function inspectMusicStagingManifests(pagesSource, schedulerSource, productionDatabaseId) {
  const problems = []
  const pagesDatabaseId = configValue(pagesSource, 'database_id')
  const schedulerDatabaseId = configValue(schedulerSource, 'database_id')
  const pagesProductionDatabase = configBlock(pagesSource, '[[env.production.d1_databases]]')
  const pagesProductionVars = configBlock(pagesSource, '[env.production.vars]')

  if (configValue(pagesSource, 'name') !== 'moodverse-music-staging') {
    problems.push('Pages config must target moodverse-music-staging.')
  }
  if (configValue(schedulerSource, 'name') !== 'moodverse-music-staging-scheduler') {
    problems.push('Scheduler config must target moodverse-music-staging-scheduler.')
  }
  if (configValue(pagesSource, 'pages_build_output_dir') !== './dist') {
    problems.push('Pages config must deploy the built ./dist directory.')
  }
  if (configValue(pagesSource, 'database_name') !== 'moodverse-music-staging-db'
    || configValue(schedulerSource, 'database_name') !== 'moodverse-music-staging-db') {
    problems.push('Both manifests must target moodverse-music-staging-db.')
  }
  if (!pagesDatabaseId || !databaseIdPattern.test(pagesDatabaseId) || pagesDatabaseId.startsWith('REPLACE_')) {
    problems.push('Staging D1 database ID is missing, invalid, or still a placeholder.')
  }
  if (pagesDatabaseId !== schedulerDatabaseId) {
    problems.push('Pages and scheduler must use the same staging D1 database ID.')
  }
  if (!pagesProductionDatabase
    || configValue(pagesProductionDatabase, 'binding') !== 'DB'
    || configValue(pagesProductionDatabase, 'database_name') !== 'moodverse-music-staging-db'
    || configValue(pagesProductionDatabase, 'database_id') !== pagesDatabaseId) {
    problems.push('Pages Production must explicitly use the same isolated staging D1 database.')
  }
  if (!pagesProductionVars
    || configValue(pagesProductionVars, 'MUSIC_EMAIL_LOGIN_ENABLED') !== 'false'
    || configValue(pagesProductionVars, 'MUSIC_ALLOW_LEGACY_ACCESS_AUTH') !== 'false') {
    problems.push('Pages Production must keep demo email and legacy authentication disabled.')
  }
  if (pagesDatabaseId && productionDatabaseId && pagesDatabaseId === productionDatabaseId) {
    problems.push('Staging must not use the production D1 database ID.')
  }
  if (!productionDatabaseId || !databaseIdPattern.test(productionDatabaseId)) {
    problems.push('Production D1 database ID could not be read from wrangler.toml; refusing to deploy.')
  }
  if (configValue(pagesSource, 'migrations_dir') !== './migrations-music-staging'
    || configValue(schedulerSource, 'migrations_dir') !== './migrations-music-staging') {
    problems.push('Both manifests must use ./migrations-music-staging.')
  }
  if (configValue(schedulerSource, 'main') !== './cron-worker.ts') {
    problems.push('Scheduler must run ./cron-worker.ts.')
  }
  if (configValue(schedulerSource, 'directory') !== './scripts' || configValue(schedulerSource, 'binding') !== 'ASSETS') {
    problems.push('Scheduler must bind the isolated scripts directory as ASSETS for demo seeding.')
  }
  if (configValue(schedulerSource, 'MUSIC_DEMO_SEED_ENABLED') !== 'true') {
    problems.push('Demo world seeding must be explicitly enabled only in the staging scheduler.')
  }
  if (!/^workers_dev\s*=\s*false\s*$/m.test(schedulerSource)) {
    problems.push('Scheduler must not expose a workers.dev endpoint (workers_dev = false).')
  }
  if (!/^crons\s*=\s*\[\s*"\*\/5 \* \* \* \*"\s*\]\s*$/m.test(schedulerSource)) {
    problems.push('Scheduler must retain the five-minute drift-bottle Cron Trigger.')
  }

  return { ok: problems.length === 0, problems }
}

function run() {
  try {
    const pagesSource = readFileSync(resolve(root, 'wrangler.music-staging.pages.toml'), 'utf8')
    const schedulerSource = readFileSync(resolve(root, 'wrangler.music-staging-scheduler.toml'), 'utf8')
    const productionSource = readFileSync(resolve(root, 'wrangler.toml'), 'utf8')
    const result = inspectMusicStagingManifests(pagesSource, schedulerSource, configValue(productionSource, 'database_id'))
    const missing = []
    if (!existsSync(resolve(root, 'dist/index.html'))) missing.push('Built dist/index.html is missing; run npm run build first.')
    if (!existsSync(resolve(root, 'migrations-music-staging/README.md'))) missing.push('The isolated staging migration directory is missing.')

    if (result.ok && !missing.length) {
      process.stdout.write('Music MVP staging preflight passed (read-only; this check did not change Cloudflare resources or secrets).\n')
      return
    }

    process.stderr.write('Music MVP staging preflight blocked:\n')
    for (const problem of [...result.problems, ...missing]) process.stderr.write(`- ${problem}\n`)
    process.stderr.write('No Cloudflare resources or secrets were changed.\n')
    process.exitCode = 1
  } catch {
    process.stderr.write('Music MVP staging preflight could not read the expected local manifests. No Cloudflare resources or secrets were changed.\n')
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) run()
