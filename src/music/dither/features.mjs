/** Shared by the browser, Pages APIs and the plain-Node catalog importer. */
export function validateMusicFeatures(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !['curated', 'audius', 'demo', 'tag-derived', 'unknown'].includes(value.source)) return { ok: false }
  const bounded = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
  for (const [key, item] of Object.entries(value)) {
    if (key === 'source') continue
    if (key === 'tempoBpm') {
      if (item !== null && (!bounded(item, 30, 300) || ['unknown', 'tag-derived'].includes(value.source))) return { ok: false }
    } else if (['energy', 'hardness', 'acousticness'].includes(key)) {
      if (!bounded(item, 0, 1)) return { ok: false }
    } else return { ok: false }
  }
  return { ok: true, value: { ...value } }
}
