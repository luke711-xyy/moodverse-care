import { create } from 'zustand'
import { careCardBillboard, mergeBillboards, planetBillboards, withPlanetBillboards } from './billboards'
import { matchCareTemplate } from '../care-templates'
import { DEFAULT_FOCUSED_THEMES, MAX_FOCUSED_THEMES, MOOD_IDS, THEMES, todayKey, uid, type Billboard, type CareCard, type DoodleStroke, type MoodEntry, type MoodId, type Planet, type PrivacyMode, type StarAppearance, type ThemeId } from './types'
import { buildPlanetSlots } from './universe'

const VISIBLE_PLANETS_PER_THEME = 10
const THEME_IDS = THEMES.map((theme) => theme.id)
const STORAGE_KEY = 'moodverse-care-v3'
const OLD_STORAGE_KEY = 'moodverse-care-v2'
const PUBLIC_CACHE_KEY = 'moodverse-public-planets-v1'
const DEFAULT_STAR_APPEARANCE: StarAppearance = { color: '#ffd166' }

export type CheckInInput = {
  planetId?: string
  theme?: ThemeId
  mood: MoodId
  intensity: number
  triggers: string[]
  privateNote: string
  publicMessage: string
  privacy: PrivacyMode
  musicUrl: string
  doodle: DoodleStroke[]
}
export type FirstDayInput = CheckInInput & { name: string; tagline: string; theme: ThemeId }
export type MutationResult = { ok: boolean; error?: string }

type Persisted = {
  planets: Planet[]
  focusedThemes: ThemeId[]
  activePlanetId?: string
  lastVisitedPlanetId?: string
  entries: MoodEntry[]
  careCards: CareCard[]
  replies: Record<string, Billboard[]>
  starAppearance: StarAppearance
}

const isTheme = (value: unknown): value is ThemeId => THEME_IDS.includes(value as ThemeId)
const focusedThemesFromValue = (value: unknown): ThemeId[] => {
  if (!Array.isArray(value)) return [...DEFAULT_FOCUSED_THEMES]
  return [...new Set(value.filter(isTheme))].slice(0, MAX_FOCUSED_THEMES)
}
const normalizeStarAppearance = (value: unknown): StarAppearance => {
  if (!value || typeof value !== 'object') return { ...DEFAULT_STAR_APPEARANCE }
  const appearance = value as Partial<StarAppearance>
  return {
    color: typeof appearance.color === 'string' && /^#[0-9a-f]{6}$/i.test(appearance.color) ? appearance.color : DEFAULT_STAR_APPEARANCE.color,
    texture: typeof appearance.texture === 'string' && appearance.texture.startsWith('data:image/webp;base64,') ? appearance.texture : undefined,
  }
}
const empty: Persisted = { planets: [], focusedThemes: [...DEFAULT_FOCUSED_THEMES], entries: [], careCards: [], replies: {}, starAppearance: { ...DEFAULT_STAR_APPEARANCE } }
const isMood = (value: unknown): value is MoodId => MOOD_IDS.includes(String(value) as MoodId)
const parseArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== 'string') return []
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed as T[] : [] } catch { return [] }
}
const decodeDoodle = (value: unknown) => parseArray<DoodleStroke>(value)
const activePlanets = (planets: Planet[]) => planets.filter((planet) => !planet.archivedAt).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
const currentPlanet = (planets: Planet[], id?: string) => id ? planets.find((planet) => planet.id === id && !planet.archivedAt) : undefined

const readStorage = (): Persisted => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Persisted>
      if (Array.isArray(parsed.planets)) return {
        planets: parsed.planets,
        focusedThemes: focusedThemesFromValue(parsed.focusedThemes),
        activePlanetId: parsed.activePlanetId,
        lastVisitedPlanetId: parsed.lastVisitedPlanetId,
        entries: parsed.entries ?? [],
        careCards: parsed.careCards ?? [],
        replies: parsed.replies ?? {},
        starAppearance: normalizeStarAppearance(parsed.starAppearance),
      }
    }
    const old = localStorage.getItem(OLD_STORAGE_KEY)
    if (old) {
      const parsed = JSON.parse(old) as { planet?: Planet; entries?: MoodEntry[]; careCards?: CareCard[]; replies?: Record<string, Billboard[]> }
      const legacy = parsed.planet ? { ...parsed.planet, id: 'self', visualSeed: 'self', tagline: '', createdAt: parsed.entries?.at(-1)?.createdAt ?? new Date().toISOString(), archivedAt: null } : undefined
      return {
        planets: legacy ? [legacy] : [],
        focusedThemes: [...DEFAULT_FOCUSED_THEMES],
        activePlanetId: legacy?.id,
        lastVisitedPlanetId: legacy?.id,
        entries: (parsed.entries ?? []).map((entry) => ({ ...entry, planetId: entry.planetId || 'self' })),
        careCards: (parsed.careCards ?? []).map((card) => ({ ...card, planetId: card.planetId || 'self' })),
        replies: parsed.replies ?? {},
        starAppearance: { ...DEFAULT_STAR_APPEARANCE },
      }
    }
  } catch {
    // Private browsing may make local storage inaccessible.
  }
  return empty
}
const persist = (state: Persisted) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* memory-only mode */ }
}

type PublicPlanetCache = { planets: Planet[]; replies: Record<string, Billboard[]> }
const readPublicPlanetCache = (): PublicPlanetCache => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PUBLIC_CACHE_KEY) || '{}') as Partial<PublicPlanetCache>
    const planets = Array.isArray(parsed.planets)
      ? parsed.planets.filter((planet) => planet && !planet.owner && !planet.isSeed)
      : []
    const replies = parsed.replies && typeof parsed.replies === 'object' ? parsed.replies : {}
    return { planets, replies }
  } catch {
    return { planets: [], replies: {} }
  }
}

const persistPublicPlanetCache = (planets: Planet[], replies: Record<string, Billboard[]>) => {
  try {
    const publicPlanets = planets.filter((planet) => !planet.owner && !planet.isSeed)
    const publicIds = new Set(publicPlanets.map((planet) => planet.id))
    const publicReplies = Object.fromEntries(Object.entries(replies).filter(([planetId]) => publicIds.has(planetId)))
    localStorage.setItem(PUBLIC_CACHE_KEY, JSON.stringify({ planets: publicPlanets, replies: publicReplies }))
  } catch { /* A cache quota failure must not interrupt planet loading. */ }
}

const entryFromRow = (row: Record<string, unknown>, fallbackPlanetId: string): MoodEntry => ({
  id: String(row.id ?? uid('entry')),
  planetId: String(row.planet_id ?? row.planetId ?? fallbackPlanetId),
  date: String(row.date ?? todayKey()),
  theme: isTheme(row.theme) ? row.theme : 'care',
  mood: isMood(row.mood) ? row.mood : 'calm',
  intensity: Number(row.intensity) || 3,
  triggers: parseArray<string>(row.triggers_json ?? row.triggers),
  privateNote: String(row.private_note ?? row.privateNote ?? ''),
  publicMessage: String(row.public_message ?? row.publicMessage ?? ''),
  privacy: (row.privacy as PrivacyMode) ?? 'private',
  musicUrl: String(row.music_url ?? row.musicUrl ?? ''),
  doodle: decodeDoodle(row.doodle_json ?? row.doodle),
  createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
})

const boardFromRow = (row: Record<string, unknown>): Billboard => ({
  id: String(row.id), kind: (row.kind as Billboard['kind']) || 'user',
  title: String(row.title ?? ''), text: String(row.text ?? ''),
  createdAt: String(row.createdAt ?? row.created_at ?? new Date().toISOString()),
  expiresAt: row.expiresAt || row.expires_at ? String(row.expiresAt ?? row.expires_at) : undefined,
  doodle: decodeDoodle(row.doodle ?? row.doodle_json),
})

const cardFromRow = (row: Record<string, unknown>, planetId: string): CareCard => ({
  id: String(row.id), planetId: String(row.planet_id ?? row.planetId ?? planetId),
  title: String(row.title ?? ''), message: String(row.message ?? ''),
  action: String(row.action ?? ''), createdAt: String(row.createdAt ?? row.created_at ?? new Date().toISOString()),
  expiresAt: String(row.expiresAt ?? row.expires_at ?? new Date().toISOString()),
  published: Boolean(row.published),
})

const planetFromRow = (row: Record<string, unknown>): Planet => {
  const theme = isTheme(row.theme) ? row.theme : 'care'
  const mood = isMood(row.public_mood ?? row.mood) ? (row.public_mood ?? row.mood) as MoodId : 'calm'
  const weatherHistory = parseArray<Record<string, unknown>>(row.weather_history ?? row.weatherHistory)
    .filter((sample) => typeof sample.date === 'string' && isMood(sample.mood))
    .map((sample) => ({ date: String(sample.date), mood: sample.mood as MoodId, intensity: Math.min(5, Math.max(1, Number(sample.intensity) || 3)) }))
  return {
    id: String(row.id ?? row.user_id ?? uid('planet')),
    alias: String(row.alias ?? row.name ?? '我的星球'),
    tagline: String(row.tagline ?? ''),
    visualSeed: String(row.visual_seed ?? row.visualSeed ?? row.id ?? 'self'),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
    archivedAt: row.archived_at ?? row.archivedAt ? String(row.archived_at ?? row.archivedAt) : null,
    theme, mood, intensity: Number(row.intensity) || 3,
    message: String(row.message ?? ''),
    musicUrl: String(row.music_url ?? row.musicUrl ?? '') || undefined,
    doodle: decodeDoodle(row.doodle_json ?? row.doodle), weatherHistory,
    owner: true, position: [0, 0, 0], orbit: 0,
  }
}

const weatherFor = (entries: MoodEntry[], planetId: string) => {
  const unique = new Map<string, { date: string; mood: MoodId; intensity: number }>()
  for (const entry of entries.filter((item) => item.planetId === planetId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (!unique.has(entry.date)) unique.set(entry.date, { date: entry.date, mood: entry.mood, intensity: entry.intensity })
  }
  return [...unique.values()].slice(0, 365)
}

const withEntryWeather = (planets: Planet[], entries: MoodEntry[]) => planets.map((planet) => {
  const recent = entries.filter((entry) => entry.planetId === planet.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return { ...planet, mood: recent?.mood ?? planet.mood, intensity: recent?.intensity ?? planet.intensity,
    doodle: recent ? recent.doodle : planet.doodle, weatherHistory: weatherFor(entries, planet.id) }
})

const localCareCard = (entry: MoodEntry): CareCard => {
  const { title, message, action } = matchCareTemplate(entry)
  return {
    id: 'care_' + entry.planetId + '_' + entry.date,
    planetId: entry.planetId, title,
    message,
    action, createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), published: false,
  }
}

async function api(path: string, init?: RequestInit): Promise<{ response: Response; data: Record<string, unknown> }> {
  const response = await fetch(path, init)
  let data: Record<string, unknown> = {}
  try { data = await response.json() as Record<string, unknown> } catch { /* non-JSON error */ }
  return { response, data }
}
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const patch = (body: unknown): RequestInit => ({ method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const put = (body: unknown): RequestInit => ({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const resultError = (data: Record<string, unknown>, fallback: string) => {
  const code = String(data.error ?? '')
  const messages: Record<string, string> = {
    PLANET_LIMIT: '活跃星球已满六颗，请先归档一颗。',
    THEME_TAKEN: '同主题已有活跃星球，请先归档它。',
    THEME_LOCKED: '这颗星球的生活主线已在第一天固定。',
    PLANET_ARCHIVED: '星球已归档，请先恢复后再记录。',
    DAILY_ENTRY_EXISTS: '这颗星球今天已经记录过天气了。',
    INVALID_FIRST_DAY: '请检查星球名字、主题和首日记录。',
    INVALID_CHECK_IN: '请检查今天的记录内容。',
    PAST_ENTRY_READ_ONLY: '过去的记录只能查看。',
  }
  return messages[code] ?? (code && code !== 'NOT_FOUND' ? code : fallback)
}

type AppState = Persisted & {
  planet?: Planet
  remotePlanets: Planet[]
  publicPlanetStatus: Record<string, 'loading' | 'ready' | 'error'>
  serverAvailable: boolean | null
  view: 'universe' | 'galaxy' | 'planet' | 'home-galaxy' | 'self'
  focusedTheme?: ThemeId
  selectedPlanetId?: string
  panel: 'none' | 'compose' | 'history' | 'care' | 'settings' | 'star'
  portal: number
  lastSaved?: string
  setView: (view: AppState['view']) => void
  setTheme: (theme?: ThemeId) => void
  setSelectedPlanet: (id?: string) => void
  setPanel: (panel: AppState['panel']) => void
  setPortal: (value: number) => void
  selectOwnPlanet: (id?: string) => void
  createPlanetAndFirstCheckIn: (input: FirstDayInput) => Promise<MutationResult>
  saveCheckIn: (input: CheckInInput) => Promise<MutationResult>
  updateTodayEntry: (planetId: string, entryId: string, input: CheckInInput) => Promise<MutationResult>
  updatePlanet: (id: string, input: { alias?: string; tagline?: string }) => Promise<MutationResult>
  updateFocusedThemes: (focusedThemes: ThemeId[]) => Promise<MutationResult & { localOnly?: boolean }>
  updateStarAppearance: (appearance: StarAppearance) => Promise<MutationResult & { localOnly?: boolean }>
  setPlanetArchived: (id: string, archived: boolean) => Promise<MutationResult>
  loadPlanetHistory: (id: string) => Promise<void>
  loadPublicPlanet: (id: string) => Promise<void>
  publishCareCard: (id: string) => void
  deleteBillboard: (id: string) => void
  addReply: (planetId: string, text: string, doodle?: DoodleStroke[]) => void
  reset: () => void
  hydrate: () => Promise<void>
  loadPublicGalaxy: (theme: ThemeId) => Promise<void>
}

const initial = readStorage()
const initialPublicCache = readPublicPlanetCache()
const initialReplies = { ...initialPublicCache.replies, ...initial.replies }
const initialActive = currentPlanet(initial.planets, initial.activePlanetId)
const initialPublicPlanetStatus = Object.fromEntries(
  initialPublicCache.planets.filter((planet) => Array.isArray(planet.billboards)).map((planet) => [planet.id, 'ready' as const]),
)

export const useAppStore = create<AppState>((set, get) => {
  const publicDetailsInFlight = new Set<string>()
  const publicGalaxiesInFlight = new Set<ThemeId>()
  const commit = (changes: Partial<Persisted>) => {
    const next: Persisted = {
      planets: changes.planets ?? get().planets,
      focusedThemes: changes.focusedThemes ?? get().focusedThemes,
      activePlanetId: 'activePlanetId' in changes ? changes.activePlanetId : get().activePlanetId,
      lastVisitedPlanetId: 'lastVisitedPlanetId' in changes ? changes.lastVisitedPlanetId : get().lastVisitedPlanetId,
      entries: changes.entries ?? get().entries,
      careCards: changes.careCards ?? get().careCards,
      replies: changes.replies ?? get().replies,
      starAppearance: changes.starAppearance ?? get().starAppearance,
    }
    persist(next)
    set({ ...next, planet: currentPlanet(next.planets, next.activePlanetId) })
  }
  const localEntry = (planet: Planet, input: CheckInInput): MoodEntry => ({
    ...input, planetId: planet.id, theme: planet.theme,
    publicMessage: input.privacy === 'billboard_public' ? input.publicMessage : '',
    id: uid('entry'), date: todayKey(), createdAt: new Date().toISOString(),
  })
  const applyEntry = (planet: Planet, entry: MoodEntry, billboardId?: string, generatedCareCard?: CareCard) => {
    const entries = [entry, ...get().entries.filter((item) => item.id !== entry.id)]
    const card = generatedCareCard ?? (get().serverAvailable === false ? localCareCard(entry) : undefined)
    const careCards = card ? [card, ...get().careCards.filter((item) => item.id !== card.id)] : get().careCards
    const createdBoard: Billboard | undefined = entry.privacy === 'billboard_public' && entry.publicMessage.trim() ? {
      id: billboardId ?? uid('billboard'), kind: 'user', text: entry.publicMessage, createdAt: entry.createdAt,
    } : undefined
    const billboards = createdBoard ? [createdBoard, ...planetBillboards(planet)] : planetBillboards(planet)
    const updated = withPlanetBillboards({
      ...planet, mood: entry.mood, intensity: entry.intensity,
      message: entry.publicMessage || planet.message,
      doodle: entry.doodle,
      musicUrl: entry.musicUrl || undefined,
    }, billboards)
    const planets = withEntryWeather(get().planets.map((item) => item.id === planet.id ? updated : item), entries)
    commit({ planets, entries, careCards })
    set({ lastSaved: entry.id })
  }

  return {
    ...initial,
    replies: initialReplies,
    planet: initialActive,
    remotePlanets: initialPublicCache.planets,
    publicPlanetStatus: initialPublicPlanetStatus,
    serverAvailable: null,
    view: 'universe',
    panel: 'none',
    portal: 0,
    setView: (view) => set({ view }),
    setTheme: (focusedTheme) => set({ focusedTheme }),
    setSelectedPlanet: (selectedPlanetId) => set({ selectedPlanetId }),
    setPanel: (panel) => set({ panel }),
    setPortal: (portal) => set({ portal: Math.max(0, Math.min(1, portal)) }),
    selectOwnPlanet: (id) => {
      if (id && !currentPlanet(get().planets, id)) return
      commit({ activePlanetId: id, lastVisitedPlanetId: id ?? get().lastVisitedPlanetId })
      if (id && get().serverAvailable) void api('/api/me/planets/' + encodeURIComponent(id) + '/visit', post({})).catch(() => undefined)
    },
    createPlanetAndFirstCheckIn: async (input) => {
      const name = input.name.trim()
      if (!name) return { ok: false, error: '请先给星球起一个名字。' }
      if (!isTheme(input.theme)) return { ok: false, error: '请选择这颗星球的生活主线。' }
      const active = activePlanets(get().planets)
      if (active.length >= 6) return { ok: false, error: '最多同时拥有六颗活跃星球，请先归档一颗。' }
      if (active.some((item) => item.theme === input.theme)) return { ok: false, error: '这条生活主线已有活跃星球。' }
      let id = uid('planet')
      let remotePlanet: Planet | undefined
      let remoteEntry: MoodEntry | undefined
      let remoteCareCard: CareCard | undefined
      const billboardId = uid('billboard')
      if (get().serverAvailable !== false) {
        try {
          const { response, data } = await api('/api/me/planets', post({ ...input, name, tagline: input.tagline.trim(), privacy: input.privacy || 'private', billboardId }))
          if (!response.ok) return { ok: false, error: resultError(data, '第一天没有保存成功，请重试。') }
          if (data.planet && typeof data.planet === 'object') remotePlanet = planetFromRow(data.planet as Record<string, unknown>)
          if (remotePlanet) id = remotePlanet.id
          if (data.entry && typeof data.entry === 'object') remoteEntry = entryFromRow(data.entry as Record<string, unknown>, id)
          if (data.careCard && typeof data.careCard === 'object') remoteCareCard = cardFromRow(data.careCard as Record<string, unknown>, id)
          set({ serverAvailable: true })
        } catch {
          if (get().serverAvailable !== false) return { ok: false, error: '连接中断，第一天尚未保存。请重试。' }
        }
      }
      const planet: Planet = remotePlanet ?? {
        id, alias: name, tagline: input.tagline.trim(), visualSeed: id,
        createdAt: new Date().toISOString(), archivedAt: null,
        theme: input.theme, mood: input.mood, intensity: input.intensity,
        message: input.privacy === 'billboard_public' ? input.publicMessage : '我正在练习听见自己的天气。',
        owner: true, position: [0, 0, 0], orbit: 0,
      }
      const entry = remoteEntry ?? localEntry(planet, input)
      const planets = [...get().planets, planet].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
      commit({ planets, activePlanetId: id, lastVisitedPlanetId: id })
      applyEntry(planet, entry, billboardId, remoteCareCard ?? (get().serverAvailable ? localCareCard(entry) : undefined))
      set({ view: 'self', portal: 1, panel: 'care' })
      if (get().serverAvailable) void get().hydrate()
      return { ok: true }
    },
    saveCheckIn: async (input) => {
      const planetId = input.planetId ?? get().activePlanetId
      const planet = currentPlanet(get().planets, planetId)
      if (!planet) return { ok: false, error: '请先创建星球，再记录今天。' }
      if (get().entries.some((entry) => entry.planetId === planet.id && entry.date === todayKey())) {
        return { ok: false, error: '这颗星球今天已经记录过天气了。' }
      }
      const billboardId = uid('billboard')
      let remoteEntry: MoodEntry | undefined
      let remoteCareCard: CareCard | undefined
      if (get().serverAvailable !== false) {
        try {
          const { response, data } = await api('/api/me/check-ins', post({ ...input, planetId: planet.id, theme: planet.theme, billboardId }))
          if (!response.ok) return { ok: false, error: resultError(data, '记录没有保存成功，请重试。') }
          if (data.entry && typeof data.entry === 'object') remoteEntry = entryFromRow(data.entry as Record<string, unknown>, planet.id)
          if (data.careCard && typeof data.careCard === 'object') remoteCareCard = cardFromRow(data.careCard as Record<string, unknown>, planet.id)
          set({ serverAvailable: true })
        } catch {
          return { ok: false, error: '连接中断，记录尚未保存。请重试。' }
        }
      }
      const entry = remoteEntry ?? localEntry(planet, input)
      applyEntry(planet, entry, billboardId, remoteCareCard ?? (get().serverAvailable ? localCareCard(entry) : undefined))
      set({ panel: 'care', view: 'self', portal: 1 })
      if (get().serverAvailable) void get().hydrate()
      return { ok: true }
    },
    updateTodayEntry: async (planetId, entryId, input) => {
      const planet = get().planets.find((item) => item.id === planetId && !item.archivedAt)
      const existing = get().entries.find((item) => item.id === entryId && item.planetId === planetId)
      if (!planet || !existing) return { ok: false, error: '找不到这条记录。' }
      if (existing.date !== todayKey()) return { ok: false, error: '过去的记录只能查看。' }
      let next: MoodEntry = { ...existing, ...input, planetId, theme: planet.theme, publicMessage: input.privacy === 'billboard_public' ? input.publicMessage : '' }
      if (get().serverAvailable !== false) {
        try {
          const { response, data } = await api('/api/me/planets/' + encodeURIComponent(planetId) + '/entries/' + encodeURIComponent(entryId), patch(input))
          if (!response.ok) return { ok: false, error: resultError(data, '修改没有保存成功，请重试。') }
          if (data.entry && typeof data.entry === 'object') next = entryFromRow(data.entry as Record<string, unknown>, planetId)
        } catch { return { ok: false, error: '连接中断，修改尚未保存。请重试。' } }
      }
      const entries = get().entries.map((entry) => entry.id === entryId ? next : entry)
      commit({ entries, planets: withEntryWeather(get().planets, entries) })
      if (get().serverAvailable) void get().hydrate()
      return { ok: true }
    },
    updatePlanet: async (id, input) => {
      const planet = get().planets.find((item) => item.id === id)
      if (!planet) return { ok: false, error: '星球不存在。' }
      const alias = input.alias?.trim() ?? planet.alias
      if (!alias) return { ok: false, error: '星球名字不能为空。' }
      let remote: Planet | undefined
      if (get().serverAvailable !== false) {
        try {
          const { response, data } = await api('/api/me/planets/' + encodeURIComponent(id), patch({ name: alias, tagline: input.tagline ?? planet.tagline ?? '' }))
          if (!response.ok) return { ok: false, error: resultError(data, '设置没有保存成功。') }
          if (data.planet && typeof data.planet === 'object') remote = planetFromRow(data.planet as Record<string, unknown>)
        } catch { return { ok: false, error: '连接中断，设置尚未保存。' } }
      }
      commit({ planets: get().planets.map((item) => item.id === id ? { ...item, ...(remote ?? {}), alias, tagline: input.tagline ?? planet.tagline } : item) })
      return { ok: true }
    },
    setPlanetArchived: async (id, archived) => {
      const planet = get().planets.find((item) => item.id === id)
      if (!planet) return { ok: false, error: '星球不存在。' }
      if (!archived) {
        const active = activePlanets(get().planets)
        if (active.length >= 6) return { ok: false, error: '活跃星球已满六颗，请先归档一颗。' }
        if (active.some((item) => item.theme === planet.theme)) return { ok: false, error: '同主题已有活跃星球，请先归档它。' }
      }
      let remote: Planet | undefined
      if (get().serverAvailable !== false) {
        try {
          const { response, data } = await api('/api/me/planets/' + encodeURIComponent(id), patch({ archived }))
          if (!response.ok) return { ok: false, error: resultError(data, '星球状态没有更新。') }
          if (data.planet && typeof data.planet === 'object') remote = planetFromRow(data.planet as Record<string, unknown>)
        } catch { return { ok: false, error: '连接中断，星球状态没有更新。' } }
      }
      const planets = get().planets.map((item) => item.id === id ? { ...item, ...(remote ?? {}), archivedAt: archived ? remote?.archivedAt ?? new Date().toISOString() : null } : item)
      const nextActive = activePlanets(planets)
      const activePlanetId = archived && get().activePlanetId === id ? nextActive[0]?.id : !archived ? id : get().activePlanetId
      const lastVisitedPlanetId = archived && get().lastVisitedPlanetId === id ? nextActive[0]?.id : !archived ? id : get().lastVisitedPlanetId
      commit({ planets, activePlanetId, lastVisitedPlanetId })
      return { ok: true }
    },
    updateFocusedThemes: async (focusedThemes) => {
      if (!Array.isArray(focusedThemes) || focusedThemes.length > MAX_FOCUSED_THEMES
        || focusedThemes.some((theme) => !isTheme(theme))
        || new Set(focusedThemes).size !== focusedThemes.length) {
        return { ok: false, error: '最多选择六个不同的关注主题。' }
      }
      const selection = [...focusedThemes]
      if (get().serverAvailable === false) {
        commit({ focusedThemes: selection })
        return { ok: true, localOnly: true }
      }
      try {
        const { response, data } = await api('/api/me/preferences', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ focusedThemes: selection }),
        })
        if (!response.ok || !Array.isArray(data.focusedThemes)) {
          return { ok: false, error: response.status === 400 ? '最多选择六个有效的关注主题。' : '关注主题没有保存成功，请重试。' }
        }
        const saved = focusedThemesFromValue(data.focusedThemes)
        if (saved.length !== selection.length || saved.some((theme, index) => theme !== selection[index])) {
          return { ok: false, error: '服务器返回的关注主题不一致，请重试。' }
        }
        commit({ focusedThemes: saved })
        set({ serverAvailable: true })
        await get().hydrate()
        return { ok: true }
      } catch {
        return { ok: false, error: '连接中断，关注主题尚未同步。' }
      }
    },
    updateStarAppearance: async (appearance) => {
      const normalized = normalizeStarAppearance(appearance)
      if (appearance.color !== normalized.color || (appearance.texture && !normalized.texture)) {
        return { ok: false, error: '恒星颜色或贴图格式无效。' }
      }
      const encodedLength = normalized.texture?.split(',')[1]?.length ?? 0
      if (encodedLength > 176000) return { ok: false, error: '贴图过大，请换一张更小的图片。' }
      if (get().serverAvailable === false) {
        commit({ starAppearance: normalized })
        return { ok: true, localOnly: true }
      }
      try {
        const { response, data } = await api('/api/me/star-appearance', put(normalized))
        if (!response.ok || !data.starAppearance || typeof data.starAppearance !== 'object') {
          return { ok: false, error: response.status === 413 ? '贴图太大，请压缩后重试。' : '恒星外观没有保存成功，请重试。' }
        }
        const saved = normalizeStarAppearance(data.starAppearance)
        commit({ starAppearance: saved })
        set({ serverAvailable: true })
        return { ok: true }
      } catch {
        return { ok: false, error: '连接中断，恒星外观尚未同步。' }
      }
    },
    loadPlanetHistory: async (id) => {
      if (!get().serverAvailable) return
      try {
        const { response, data } = await api('/api/me/history?planetId=' + encodeURIComponent(id) + '&range=all')
        if (!response.ok) return
        const remote = Array.isArray(data.entries) ? data.entries.map((row) => entryFromRow(row as Record<string, unknown>, id)) : []
        const entries = [...get().entries.filter((entry) => entry.planetId !== id), ...remote].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        commit({ entries, planets: withEntryWeather(get().planets, entries) })
      } catch { /* Existing local history remains visible. */ }
    },
    publishCareCard: (id) => {
      const card = get().careCards.find((item) => item.id === id)
      if (!card) return
      const careCards = get().careCards.map((item) => item.id === id ? { ...item, published: true } : item)
      const planets = get().planets.map((planet) => planet.id === card.planetId
        ? withPlanetBillboards(planet, mergeBillboards([careCardBillboard(card)], planetBillboards(planet))) : planet)
      commit({ planets, careCards })
      if (get().serverAvailable) void api('/api/me/care-cards', post({ id, planetId: card.planetId, published: true })).catch(() => undefined)
    },
    deleteBillboard: (id) => {
      const planet = get().planet
      if (!planet) return
      const removed = planetBillboards(planet).find((item) => item.id === id)
      if (!removed) return
      const planets = get().planets.map((item) => item.id === planet.id
        ? (() => {
          const remaining = planetBillboards(item).filter((board) => board.id !== id)
          const updated = withPlanetBillboards(item, remaining)
          const nextMessage = remaining.find((board) => board.kind === 'user')?.text
          return { ...updated, message: removed.kind === 'user' && item.message === removed.text ? nextMessage ?? '' : item.message }
        })() : item)
      const careCards = removed.kind === 'ai' ? get().careCards.map((card) => card.id === id ? { ...card, published: false } : card) : get().careCards
      commit({ planets, careCards })
      if (get().serverAvailable) {
        if (removed.kind === 'ai') void api('/api/me/care-cards', post({ id, planetId: planet.id, published: false })).catch(() => undefined)
        else void api('/api/me/billboards/' + encodeURIComponent(id) + '?planetId=' + encodeURIComponent(planet.id), { method: 'DELETE' }).catch(() => undefined)
      }
    },
    addReply: (planetId, text, doodle) => {
      if (!text.trim() && !doodle?.length) return
      const reply: Billboard = { id: uid('reply'), kind: 'reply', text: text.trim() || '留下一枚安静的星光。', createdAt: new Date().toISOString(), authorName: '路过的观测者', doodle }
      const replies = { ...get().replies, [planetId]: [reply, ...(get().replies[planetId] ?? [])] }
      commit({ replies })
      persistPublicPlanetCache(get().remotePlanets, replies)
      void api('/api/planets/' + encodeURIComponent(planetId) + '/replies', post({ text, doodle: doodle ?? [] })).catch(() => undefined)
    },
    loadPublicGalaxy: async (theme) => {
      if (publicGalaxiesInFlight.has(theme)) return
      publicGalaxiesInFlight.add(theme)
      try {
        const { response, data } = await api('/api/universe?theme=' + encodeURIComponent(theme))
        if (!response.ok || !Array.isArray(data.planets)) return
        const currentPlanets = get().remotePlanets
        const currentById = new Map(currentPlanets.map((planet) => [planet.id, planet]))
        const slots = buildPlanetSlots(theme, VISIBLE_PLANETS_PER_THEME, 3.2)
        const updatedPlanets = data.planets
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
          .map((row, index) => {
            const normalized = planetFromRow(row)
            const current = currentById.get(normalized.id)
            const billboards = Array.isArray(row.billboards)
              ? row.billboards.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map(boardFromRow)
              : []
            return withPlanetBillboards({
              ...current,
              ...normalized,
              owner: false,
              position: current?.position ?? slots[index % slots.length],
              orbit: current?.orbit ?? index * .5,
            }, billboards)
          })
        // A cache refresh can return a different random sample. Keep an already
        // opened planet visible until its detail request completes instead of
        // letting the galaxy refresh detach the active drawer from its asset.
        const selectedId = get().selectedPlanetId
        const selectedPlanet = selectedId ? currentById.get(selectedId) : undefined
        const selectedKeep = selectedPlanet?.theme === theme && !updatedPlanets.some((planet) => planet.id === selectedPlanet.id)
          ? selectedPlanet
          : undefined
        const visiblePlanets = selectedKeep
          ? [selectedKeep, ...updatedPlanets].slice(0, VISIBLE_PLANETS_PER_THEME)
          : updatedPlanets
        const remotePlanets = [...currentPlanets.filter((planet) => planet.theme !== theme), ...visiblePlanets]
        set({ remotePlanets })
        persistPublicPlanetCache(remotePlanets, get().replies)
      } catch {
        // Keep the cached galaxy available if the refresh cannot reach D1.
      } finally {
        publicGalaxiesInFlight.delete(theme)
      }
    },
    loadPublicPlanet: async (id) => {
      if (publicDetailsInFlight.has(id)) return
      const cached = get().remotePlanets.find((planet) => planet.id === id)
      if (!cached || cached.owner) return
      publicDetailsInFlight.add(id)
      set({ publicPlanetStatus: { ...get().publicPlanetStatus, [id]: 'loading' } })
      try {
        const { response, data } = await api('/api/planets/' + encodeURIComponent(id))
        if (!response.ok || !data.planet || typeof data.planet !== 'object') {
          if (response.status === 404) {
            const remotePlanets = get().remotePlanets.filter((planet) => planet.id !== id)
            const replies = { ...get().replies }
            delete replies[id]
            commit({ replies })
            const state = get()
            set({ remotePlanets, replies, publicPlanetStatus: { ...state.publicPlanetStatus, [id]: 'error' },
              selectedPlanetId: state.selectedPlanetId === id ? undefined : state.selectedPlanetId,
              view: state.view === 'planet' && state.selectedPlanetId === id ? (state.focusedTheme ? 'galaxy' : 'universe') : state.view })
            persistPublicPlanetCache(remotePlanets, replies)
            return
          }
          set({ publicPlanetStatus: { ...get().publicPlanetStatus, [id]: 'error' } })
          return
        }
        const current = get().remotePlanets.find((planet) => planet.id === id)
        if (!current) return
        const row = data.planet as Record<string, unknown>
        const normalized = planetFromRow(row)
        const billboards = Array.isArray(data.billboards)
          ? data.billboards.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map(boardFromRow)
          : []
        const repliesFromServer = Array.isArray(data.replies)
          ? data.replies.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item) => ({
              ...boardFromRow({ ...item, kind: 'reply' }),
              kind: 'reply' as const,
            }))
          : []
        const nextPlanet = withPlanetBillboards({
          ...current,
          ...normalized,
          owner: false,
          message: typeof row.message === 'string' ? row.message : current.message,
          position: current.position,
          orbit: current.orbit,
        }, billboards)
        const remotePlanets = get().remotePlanets.map((planet) => planet.id === id ? nextPlanet : planet)
        const replies = {
          ...get().replies,
          [id]: mergeBillboards(get().replies[id] ?? [], repliesFromServer),
        }
        set({ remotePlanets, replies, publicPlanetStatus: { ...get().publicPlanetStatus, [id]: 'ready' } })
        persistPublicPlanetCache(remotePlanets, replies)
      } catch {
        set({ publicPlanetStatus: { ...get().publicPlanetStatus, [id]: 'error' } })
      } finally {
        publicDetailsInFlight.delete(id)
      }
    },
    reset: () => {
      persist(empty)
      set({ ...empty, activePlanetId: undefined, lastVisitedPlanetId: undefined, planet: undefined, lastSaved: undefined, panel: 'none', view: 'universe', portal: 0 })
    },
    hydrate: async () => {
      try {
        const session = await api('/api/session', post({}))
        if (!session.response.ok) throw new Error('NO_SESSION')
        const [universe, own, preferences, star] = await Promise.all([
          api('/api/universe'), api('/api/me/planets'), api('/api/me/preferences'), api('/api/me/star-appearance'),
        ])
        if (!universe.response.ok || !own.response.ok || !Array.isArray(universe.data.planets) || !Array.isArray(own.data.planets)) {
          throw new Error('NO_API')
        }
        const focusedThemes = preferences.response.ok
          ? focusedThemesFromValue(preferences.data.focusedThemes)
          : get().focusedThemes
        const starAppearance = star.response.ok ? normalizeStarAppearance(star.data.starAppearance) : get().starAppearance
        commit({ focusedThemes, starAppearance })
        const slotIndexes = Object.fromEntries(THEME_IDS.map((theme) => [theme, 0])) as Record<ThemeId, number>
        const slots = Object.fromEntries(THEME_IDS.map((theme) => [theme, buildPlanetSlots(theme, VISIBLE_PLANETS_PER_THEME, 3.2)])) as Record<ThemeId, Planet['position'][]>
        const cachedPlanetsById = new Map(get().remotePlanets.map((planet) => [planet.id, planet]))
        const remotePlanets: Planet[] = (Array.isArray(universe.data.planets) ? universe.data.planets : []).map((item) => {
          const row = item as Record<string, unknown>
          const planet = planetFromRow(row)
          const slotIndex = slotIndexes[planet.theme]++
          const cached = cachedPlanetsById.get(planet.id)
          return { ...cached, ...planet, owner: false,
            billboards: cached?.billboards, billboard: cached?.billboard,
            position: slots[planet.theme][slotIndex % VISIBLE_PLANETS_PER_THEME], orbit: slotIndex * .5 }
        })
        const rows = Array.isArray(own.data.planets) ? own.data.planets as Record<string, unknown>[] : []
        let planets = rows.map(planetFromRow).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
        const latestId = String(own.data.lastVisitedPlanetId ?? '')
        const preferredId = get().lastVisitedPlanetId ?? get().activePlanetId
        const rememberedId = currentPlanet(planets, preferredId)?.id ?? currentPlanet(planets, latestId)?.id ?? activePlanets(planets)[0]?.id
        const embryoOpen = get().view === 'self' && get().activePlanetId === undefined && !!get().lastVisitedPlanetId
        const activePlanetId = embryoOpen ? undefined : rememberedId
        const activeRows = await Promise.all(planets.map(async (planet) => {
          const id = encodeURIComponent(planet.id)
          const [history, cards, boards] = await Promise.all([
            api('/api/me/history?planetId=' + id + '&range=all'),
            api('/api/me/care-cards?planetId=' + id),
            api('/api/me/billboards?planetId=' + id),
          ])
          return {
            id: planet.id,
            entries: history.response.ok && Array.isArray(history.data.entries) ? history.data.entries.map((row) => entryFromRow(row as Record<string, unknown>, planet.id)) : [],
            cards: cards.response.ok && Array.isArray(cards.data.cards) ? cards.data.cards.map((row) => cardFromRow(row as Record<string, unknown>, planet.id)) : [],
            boards: boards.response.ok && Array.isArray(boards.data.billboards) ? boards.data.billboards.map((row) => boardFromRow(row as Record<string, unknown>)) : [],
          }
        }))
        const entries = activeRows.flatMap((item) => item.entries).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        const careCards = activeRows.flatMap((item) => item.cards)
        planets = withEntryWeather(planets, entries).map((planet) => {
          const ownBoards = activeRows.find((item) => item.id === planet.id)?.boards ?? []
          const published = careCards.filter((card) => card.planetId === planet.id && card.published).map(careCardBillboard)
          return withPlanetBillboards(planet, mergeBillboards(ownBoards, published))
        })
        commit({ planets, focusedThemes, activePlanetId, lastVisitedPlanetId: rememberedId, entries, careCards })
        set({ remotePlanets, serverAvailable: true })
        persistPublicPlanetCache(remotePlanets, get().replies)
      } catch {
        if (get().serverAvailable === null) set({ serverAvailable: false })
      }
    },
  }
})

export const getVisiblePlanets = (theme?: ThemeId, remote: Planet[] = [], visibleThemes: ThemeId[] = THEME_IDS) => {
  const forTheme = (themeId: ThemeId) => remote
    .filter((planet) => planet.theme === themeId && !planet.owner && !planet.archivedAt && !planet.isSeed)
    .slice(0, VISIBLE_PLANETS_PER_THEME)
  return theme ? visibleThemes.includes(theme) ? forTheme(theme) : [] : visibleThemes.flatMap(forTheme)
}
