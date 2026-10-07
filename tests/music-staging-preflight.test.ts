import { describe, expect, it } from 'vitest'
import { inspectMusicStagingManifests } from '../scripts/music-staging-preflight.mjs'

const validPagesManifest = `
name = "moodverse-music-staging"
pages_build_output_dir = "./dist"
[[d1_databases]]
binding = "DB"
database_name = "moodverse-music-staging-db"
database_id = "12345678-1234-1234-1234-123456789abc"
migrations_dir = "./migrations-music-staging"
`

const validSchedulerManifest = `
name = "moodverse-music-staging-scheduler"
main = "./cron-worker.ts"
workers_dev = false
[triggers]
crons = ["*/5 * * * *"]
[assets]
directory = "./scripts"
binding = "ASSETS"
[vars]
MUSIC_DEMO_SEED_ENABLED = "true"
[[d1_databases]]
binding = "DB"
database_name = "moodverse-music-staging-db"
database_id = "12345678-1234-1234-1234-123456789abc"
migrations_dir = "./migrations-music-staging"
`

const inspect = (pages = validPagesManifest, scheduler = validSchedulerManifest) =>
  inspectMusicStagingManifests(pages, scheduler, 'f765e46d-cbc6-4f47-810c-413b6f03b6bd')

describe('music staging deployment preflight', () => {
  it('accepts isolated Pages and scheduler manifests sharing a real non-production D1 database', () => {
    expect(inspect()).toEqual({ ok: true, problems: [] })
  })

  it('blocks deployment while the staging database ID is still a placeholder', () => {
    const result = inspect(validPagesManifest.replace('12345678-1234-1234-1234-123456789abc', 'REPLACE_WITH_STAGING_D1_DATABASE_ID'))
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toMatch(/staging D1 database ID/i)
  })

  it('blocks the production database even when both manifests point to it', () => {
    const productionId = 'f765e46d-cbc6-4f47-810c-413b6f03b6bd'
    const result = inspect(validPagesManifest.replace('12345678-1234-1234-1234-123456789abc', productionId),
      validSchedulerManifest.replace('12345678-1234-1234-1234-123456789abc', productionId))
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toMatch(/production D1/i)
  })

  it('fails closed when the legacy production D1 ID cannot be read', () => {
    const result = inspectMusicStagingManifests(validPagesManifest, validSchedulerManifest, null)
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toMatch(/production D1 database ID/i)
  })

  it('blocks mismatched D1 bindings and an internet-exposed scheduler', () => {
    const mismatch = inspect(validPagesManifest, validSchedulerManifest.replace('12345678-1234-1234-1234-123456789abc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'))
    expect(mismatch.ok).toBe(false)
    expect(mismatch.problems.join(' ')).toMatch(/same staging D1/i)

    const exposed = inspect(validPagesManifest, validSchedulerManifest.replace('workers_dev = false', 'workers_dev = true'))
    expect(exposed.ok).toBe(false)
    expect(exposed.problems.join(' ')).toMatch(/workers_dev/i)
  })

  it('requires demo seeding to be isolated to the private staging scheduler', () => {
    const missingAssets = inspect(validPagesManifest, validSchedulerManifest.replace('binding = "ASSETS"', 'binding = "FILES"'))
    expect(missingAssets.problems.join(' ')).toMatch(/scripts directory as ASSETS/i)

    const disabledSeed = inspect(validPagesManifest, validSchedulerManifest.replace('MUSIC_DEMO_SEED_ENABLED = "true"', 'MUSIC_DEMO_SEED_ENABLED = "false"'))
    expect(disabledSeed.problems.join(' ')).toMatch(/explicitly enabled only in the staging scheduler/i)
  })
})
