import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pagesConfigUrl = new URL('../wrangler.music-staging.pages.toml', import.meta.url)
const schedulerConfigUrl = new URL('../wrangler.music-staging-scheduler.toml', import.meta.url)
const productionDatabaseId = 'f765e46d-cbc6-4f47-810c-413b6f03b6bd'

function configValue(source: string, key: string) {
  return source.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'))?.[1] ?? null
}

describe('isolated music staging deployment manifests', () => {
  it('routes Pages and the scheduled Worker to the same non-production D1 database', () => {
    expect(existsSync(pagesConfigUrl), 'Pages staging config must exist').toBe(true)
    expect(existsSync(schedulerConfigUrl), 'scheduler staging config must exist').toBe(true)
    if (!existsSync(pagesConfigUrl) || !existsSync(schedulerConfigUrl)) return

    const pages = readFileSync(pagesConfigUrl, 'utf8')
    const scheduler = readFileSync(schedulerConfigUrl, 'utf8')
    const pagesDatabaseId = configValue(pages, 'database_id')
    const schedulerDatabaseId = configValue(scheduler, 'database_id')

    expect(configValue(pages, 'name')).toBe('moodverse-music-staging')
    expect(pages).toMatch(/^pages_build_output_dir\s*=\s*"\.\/dist"/m)
    expect(configValue(scheduler, 'name')).toBe('moodverse-music-staging-scheduler')
    expect(configValue(scheduler, 'main')).toBe('./cron-worker.ts')
    expect(configValue(pages, 'database_name')).toBe('moodverse-music-staging-db')
    expect(configValue(scheduler, 'database_name')).toBe('moodverse-music-staging-db')
    expect(configValue(pages, 'migrations_dir')).toBe('./migrations-music-staging')
    expect(configValue(scheduler, 'migrations_dir')).toBe('./migrations-music-staging')
    expect(pagesDatabaseId).not.toBeNull()
    expect(schedulerDatabaseId).toBe(pagesDatabaseId)
    expect(pagesDatabaseId).not.toBe(productionDatabaseId)
    expect(scheduler).toMatch(/^crons\s*=\s*\[\s*"\*\/5 \* \* \* \*"\s*\]/m)
    expect(scheduler).toMatch(/^workers_dev\s*=\s*false/m)
    expect(configValue(scheduler, 'directory')).toBe('./scripts')
    expect(configValue(scheduler, 'binding')).toBe('ASSETS')
    expect(configValue(scheduler, 'MUSIC_DEMO_SEED_ENABLED')).toBe('true')
  })
})
