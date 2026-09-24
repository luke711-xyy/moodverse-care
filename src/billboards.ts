import type { Billboard, CareCard, Planet } from './types'

export function planetBillboards(planet?: Pick<Planet, 'billboard' | 'billboards'>): Billboard[] {
  if (!planet) return []
  const billboards = Array.isArray(planet.billboards) ? planet.billboards : planet.billboard ? [planet.billboard] : []
  return billboards.filter((billboard) => billboard.text.trim().length > 0)
}

export function withPlanetBillboards(planet: Planet, billboards: Billboard[]): Planet {
  return { ...planet, billboards, billboard: billboards[0] }
}

export function careCardBillboard(card: CareCard): Billboard {
  return {
    id: card.id,
    kind: 'ai',
    title: card.title,
    text: `${card.message}\n${card.action}`,
    createdAt: card.createdAt,
    expiresAt: card.expiresAt,
  }
}

export function billboardTextParts(billboard: Billboard) {
  const lines = billboard.text.split('\n')
  const legacyTitle = billboard.kind === 'ai' && !billboard.title ? lines.shift() ?? '' : ''
  const kindTitle = billboard.kind === 'ai' ? '关怀告示' : billboard.kind === 'reply' ? '路过的回应' : '留给路过的人'
  return {
    title: billboard.title || legacyTitle || kindTitle,
    body: billboard.title || billboard.kind !== 'ai' ? billboard.text : lines.join('\n'),
  }
}

function equivalentLegacyBillboard(a: Billboard, b: Billboard) {
  if (a.kind !== b.kind || a.text !== b.text || JSON.stringify(a.doodle ?? []) !== JSON.stringify(b.doodle ?? [])) return false
  const aTime = Date.parse(a.createdAt)
  const bTime = Date.parse(b.createdAt)
  return Number.isFinite(aTime) && Number.isFinite(bTime) && Math.abs(aTime - bTime) < 120_000
}

export function mergeBillboards(local: Billboard[], remote: Billboard[]): Billboard[] {
  const matchedRemote = new Set<string>()
  const merged = local.map((board) => {
    const match = remote.find((item) => item.id === board.id)
      ?? remote.find((item) => !matchedRemote.has(item.id) && equivalentLegacyBillboard(board, item))
    if (!match) return board
    matchedRemote.add(match.id)
    return { ...board, ...match, doodle: board.doodle?.length ? board.doodle : match.doodle }
  })
  remote.forEach((board) => {
    if (!matchedRemote.has(board.id) && !merged.some((item) => item.id === board.id)) merged.push(board)
  })
  return merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}
