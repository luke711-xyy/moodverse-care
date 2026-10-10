/** Offline SQL generator. See scripts/music-audius-cleanup.md before release. */
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCleanup } from './music-audius-cleanup'

const [snapshot, destination, seed] = process.argv.slice(2)
if (!snapshot || !destination || !resolve(destination).startsWith('/tmp/mosic-'))
  throw new Error('Usage: node <bundle.mjs> <music-snapshot.sql> /tmp/mosic-<release>.sql [seed]')
const rollback = destination.replace(/\.sql$/, '') + '.rollback.sql'
const report = destination.replace(/\.sql$/, '') + '.report.json'
if ([destination, rollback, report].some(path => resolve(path) === resolve(snapshot))) throw new Error('Output must not overwrite the snapshot')
const result = generateCleanup(readFileSync(snapshot, 'utf8'), { seed })
for (const [path, data] of [[destination, result.cleanupSql], [rollback, result.rollbackSql], [report, JSON.stringify(result.report, null, 2) + '\n']]) {
  writeFileSync(path, data, { mode: 0o600, flag: 'wx' })
  chmodSync(path, 0o600)
}
console.log(JSON.stringify({ ...result.report, assignments: undefined, cleanupFile: destination, rollbackFile: rollback, reportFile: report }))
