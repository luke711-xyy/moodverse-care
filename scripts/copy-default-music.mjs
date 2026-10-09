import { mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const source = process.argv[2]
if (!source) throw new Error('Pass the user-supplied the_mountain-cosmos-587577.mp3 path. Audio is intentionally not stored in Git.')
const target = fileURLToPath(new URL('../public/audio/the-mountain-cosmos.mp3', import.meta.url))
await mkdir(fileURLToPath(new URL('../public/audio/', import.meta.url)), { recursive: true })
await copyFile(source, target)
console.log('Default recording prepared for the next Pages build.')
