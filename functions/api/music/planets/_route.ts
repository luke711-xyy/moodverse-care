export function decodePlanetRouteId(value: unknown): string | null {
  if (typeof value !== 'string') return null

  let id: string
  try {
    id = decodeURIComponent(value.trim())
  } catch {
    return null
  }

  if (!id || id.length > 128 || /[\/\\\u0000-\u001f]/.test(id)) return null
  return id
}
