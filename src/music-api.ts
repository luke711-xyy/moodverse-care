import type { MusicTrackSummary, MomentVisibility } from './music-domain'
import type { PlanetTerrainFeatureCounts } from './types'
import type { DitherOverrides, DitherPlanetSpec } from './music/dither/appearance'
import { sampleGalaxyNodes, type GalaxyPreferences, type GalaxyPreferencesPatch, type GalaxyOptionsPage, type GalaxySelectionKind } from './music/galaxy-preferences'
import { dailyRandom, musicDayKey } from './music/daily-selection'

export type MusicPlanetVisual = {
  schemaVersion: number
  summary: string
  palette: { surface: string; ocean: string; accent: string }
  atmosphere: 'clear' | 'mist' | 'nebula' | 'starlit'
  motion: 'still' | 'drift' | 'flow' | 'pulse'
  particleDensity: number
  terrainFeatures?: PlanetTerrainFeatureCounts
}

export type MusicPlanetTrack = MusicTrackSummary & {
  position: number
  isPrimary: boolean
  selectedAt: string
}

export type MusicPlanet = {
  id: string
  displayName: string
  tagline: string
  visibility: 'public' | 'private'
  visualSchemaVersion: number
  appearanceRevision?: number
  visual: MusicPlanetVisual | Record<string, unknown>
  createdAt: string
  updatedAt: string
  tracks: MusicPlanetTrack[]
}

export type MusicFriendSatellite = {
  id: string
  planetId?: string
  displayName: string
  tagline: string
  color: string
  visualSeed: string
  orbitRadius: number
  orbitPhase: number
  isVirtual: boolean
  canRemove: boolean
  visual?: DitherPlanetSpec
}

export type MusicMoment = {
  id: string
  trackId: string
  track: MusicTrackSummary
  contentText: string
  photoUrl: string | null
  visibility: MomentVisibility
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type PublicMusicPlanet = MusicPlanet & { moments: MusicMoment[]; friendSatellites?: MusicFriendSatellite[] }

export type SongPortalMatch = {
  visual?: DitherPlanetSpec
  planetId: string
  displayName: string
  tagline: string
  matchSource: 'active_selection' | 'public_moment' | 'active_selection_and_public_moment'
  selectedAt: string | null
  latestPublicMomentAt: string | null
  rankScore: number | null
  reasonCode: 'shared_song_selection' | 'shared_public_moment' | 'shared_selection_and_moment'
}

export type SongPortalResponse = {
  trackId: string
  ranking: {
    mode: 'stable_fallback' | 'model'
    status: 'not_configured' | 'no_candidates' | 'ready' | 'gateway_unavailable' | 'invalid_output' | 'input_changed'
    model: { name: string; version: string } | null
    taskId: string | null
  }
  matches: SongPortalMatch[]
}

export type GalaxyGroupBy = 'song' | 'artist' | 'genre'

export type GalaxyPlanetCard = {
  planetId: string
  displayName: string
  tagline: string
  reasonCode: 'same_song' | 'same_artist' | 'same_genre'
  visual?: MusicPlanetVisual | DitherPlanetSpec
}

export type GalaxyGroup = {
  key: string
  label: string
  planetCount: number
  planets: GalaxyPlanetCard[]
}

export type MusicGalaxyResponse = {
  by: GalaxyGroupBy
  groups: GalaxyGroup[]
}

export type GalaxySongDetails = {
  description?: string | null
  releasedAt?: string | null
  bpm?: number | null
  musicalKey?: string | null
  tags?: string[]
  playCount?: number | null
  favoriteCount?: number | null
  repostCount?: number | null
}
export type MusicGalaxyContent = {
  by: GalaxyGroupBy
  key: string
  label: string
  description: string | null
  tracks: MusicTrackSummary[]
  songDetails?: GalaxySongDetails
  relatedTracks?: MusicTrackSummary[]
  hasMore: boolean
  nextOffset: number | null
  status: 'live' | 'cached' | 'local' | 'offline'
}

export type MusicDiscoveryResponse = {
  ranking: {
    mode: 'model' | 'stable_fallback'
    status: 'ready' | 'not_configured' | 'no_candidates' | 'no_query_signals' | 'gateway_unavailable' | 'invalid_output' | 'input_changed'
    model: { name: string; version: string } | null
    taskId: string | null
  }
  recommendations: Array<{
    visual?: DitherPlanetSpec
    planetId: string
    displayName: string
    tagline: string
    reasonCode: 'similar_genre' | 'similar_mood' | 'similar_moment' | 'semantic_profile' | 'random'
    matchScore: number
  }>
}

export type MusicOrbitCard = {
  planetId: string
  displayName: string
  tagline: string
  occurredAt: string
  visual?: DitherPlanetSpec
}

export type MusicOrbitResponse = {
  date: string
  groups: {
    songEncounters: MusicOrbitCard[]
    friends: Array<Omit<MusicOrbitCard, 'planetId'> & { userId: string; planetId: string | null; canVisit: boolean; unreadCount: number; lastMessageAt?: string | null }>
    visitedByMe: Array<MusicOrbitCard & { isIncognito: boolean }>
    visitorsToMe: Array<MusicOrbitCard & { userId: string }>
    dailyRoam: Array<MusicOrbitCard & {
      reasonCode: MusicDiscoveryResponse['recommendations'][number]['reasonCode']
      matchScore: number
    }>
  }
}

export type MusicFriendRequestCard = {
  id: string
  userId: string
  planetId: string | null
  displayName: string
  tagline: string
  status: 'pending' | 'rejected'
  createdAt: string
  visual?: DitherPlanetSpec
}

export type MusicFriendRequestsResponse = {
  incoming: MusicFriendRequestCard[]
  outgoing: MusicFriendRequestCard[]
}

export type MusicSocialSnapshot = MusicFriendRequestsResponse & { friends: MusicOrbitResponse['groups']['friends'] }

export type MusicDirectMessage = {
  id: string
  contentText: string
  createdAt: string
  readAt: string | null
  isOwn: boolean
  kind?: 'text' | 'song' | 'photo'
  track?: MusicTrackSummary | null
  photoUrl?: string
}

export type MusicDirectMessagesResponse = {
  peerUserId: string
  messages: MusicDirectMessage[]
  hasMore?: boolean
  nextCursor?: string | null
}

export type MusicDriftBottleTopicInput =
  | { type: 'song'; trackId: string }
  | { type: 'info'; title: string; url: string; summary: string }
  | { type: 'moment'; momentId: string }

export type MusicDriftBottleTopic =
  | { type: 'song'; track: MusicTrackSummary | null }
  | { type: 'info'; title: string; url: string; summary: string }
  | { type: 'moment'; momentId: string | null; contentText: string; photoUrl?: string | null; track: MusicTrackSummary | null }

export type MusicDriftBottleComment = {
  id: string
  contentText: string
  createdAt: string
  authorName: string
  isOwn: boolean
  likeCount: number
  likedByMe: boolean
}

export type MusicDriftBottlesResponse = {
  date: string
  allowReceiving: boolean
  sentToday: boolean
  inbox: Array<{
    id: string
    topicType: 'song' | 'info' | 'moment'
    topicLabel: string
    status: 'unread' | 'read'
    deliveredAt: string
    expiresAt: string
  }>
  sent: Array<{
    id: string
    topicType: 'song' | 'info' | 'moment'
    topicLabel: string
    status: 'delivered' | 'waiting_for_release' | 'waiting' | 'stopped' | 'unavailable'
    deliveryCount: number
    createdAt: string
  }>
}

export type MusicDriftBottleDetail = {
  bottle: {
    id: string
    topic: MusicDriftBottleTopic
    messageText: string
    sender: { planetId: string; displayName: string; tagline: string } | null
  }
  delivery: { id: string; status: 'read'; deliveredAt: string; expiresAt: string; canRelease: boolean }
  comments: MusicDriftBottleComment[]
}

export type MusicReportTarget = {
  type: 'planet' | 'moment' | 'drift_bottle' | 'drift_comment' | 'direct_message'
  id: string
}

export type MusicReportReason = 'spam' | 'harassment' | 'inappropriate' | 'privacy' | 'copyright' | 'other'

export type MusicReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed'
export type MusicReportQueueFilter = MusicReportStatus | 'all'
export type MusicAdminReport = {
  id: string
  target: MusicReportTarget
  reason: MusicReportReason
  detail: string
  status: MusicReportStatus
  createdAt: string
  lastReview: {
    fromStatus: string | null
    toStatus: string | null
    reviewerUserId: string | null
    createdAt: string
  } | null
}

export type MusicReportQueueResponse = {
  reports: MusicAdminReport[]
  hasMore: boolean
}

export type MusicPlanetVisitSource = 'direct' | 'song_portal' | 'galaxy' | 'random_roam' | 'daily_roam' | 'orbit'

export type PlanetComposerTask = {
  id: string
  kind?: 'planet_composer'
  status: 'queued' | 'running' | 'succeeded' | 'failed'
}

export type MusicPlanetDraft = {
  displayName: string
  tagline: string
  trackIds: string[]
  visibility: 'public' | 'private'
  appearanceOverrides?: DitherOverrides
}

export type MusicSocialSettings = {
  allowFriendRequests: boolean
  allowDriftBottles: boolean
}
export type MusicUserBlock = { userId: string; planetId: string | null; displayName: string; createdAt: string }
export type MusicCatalogPage = { tracks: MusicTrackSummary[]; status?: 'live' | 'cached' | 'offline' | 'local'; hasMore?: boolean; nextOffset?: number | null }

export type MusicMomentDraft = {
  trackId: string
  contentText: string
  visibility: MomentVisibility
}

export class MusicApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
    this.name = 'MusicApiError'
  }
}

function errorCode(value: unknown) {
  return typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string'
    ? value.error
    : 'REQUEST_FAILED'
}

export function createMusicApi(fetcher: typeof fetch = fetch, options: { liveSocial?: boolean } = {}) {
  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetcher(url, {
      ...init,
      credentials: init?.credentials ?? 'same-origin',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        ...(init?.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    if (!response.ok) throw new MusicApiError(response.status, errorCode(payload))
    return payload as T
  }

  return {
    liveSocial: options.liveSocial !== false,
    async loadSocialState(signal?: AbortSignal) {
      const state = await request<MusicSocialSnapshot>('/api/me/friend-requests?live=1', { signal })
      if (!state || !Array.isArray(state.incoming) || !Array.isArray(state.outgoing) || !Array.isArray(state.friends)) {
        throw new MusicApiError(502, 'INVALID_SOCIAL_STATE')
      }
      return state
    },
    subscribeSocialState(onState: (state: MusicSocialSnapshot) => void, onConnection: (connected: boolean) => void) {
      if (options.liveSocial === false || typeof EventSource === 'undefined') return null
      const source = new EventSource('/api/me/friend-requests?stream=1')
      const receive = (event: Event) => {
        try {
          const state = JSON.parse((event as MessageEvent).data) as MusicSocialSnapshot
          if (Array.isArray(state.incoming) && Array.isArray(state.outgoing) && Array.isArray(state.friends)) onState(state)
        } catch { onConnection(false) }
      }
      const open = () => onConnection(true), error = () => onConnection(false)
      source.addEventListener('social', receive)
      source.addEventListener('open', open)
      source.addEventListener('error', error)
      return () => {
        source.removeEventListener('social', receive); source.removeEventListener('open', open); source.removeEventListener('error', error)
        source.close()
      }
    },
    searchCatalog(query = '', genre = '', offset = 0, signal?: AbortSignal) {
      return request<MusicCatalogPage>(`/api/music/catalog?${new URLSearchParams({ q: query, genre, offset: String(offset) })}`, { signal })
    },
    loadGalaxyPreferences() {
      return request<GalaxyPreferences>('/api/me/galaxy-preferences')
    },
    updateGalaxyPreferences(value: string[] | GalaxyPreferencesPatch) {
      return request<GalaxyPreferences>('/api/me/galaxy-preferences', { method: 'PATCH', body: JSON.stringify(Array.isArray(value) ? { genres: value } : value) })
    },
    searchGalaxyOptions(by: GalaxySelectionKind, query = '', offset = 0, signal?: AbortSignal) {
      return request<GalaxyOptionsPage>(`/api/music/galaxy-options?${new URLSearchParams({ by, q: query, offset: String(offset) })}`, { signal })
    },
    async loadHome() {
      const [catalog, owned] = await Promise.all([
        request<{ tracks: MusicTrackSummary[] }>('/api/music/catalog'),
        request<{ planet: MusicPlanet | null; friendSatellites?: MusicFriendSatellite[] }>('/api/me/music-planet'),
      ])
      return { tracks: catalog.tracks, planet: owned.planet, friendSatellites: owned.friendSatellites ?? [] }
    },
    loadFriendSatellites() {
      return request<{ friendSatellites: MusicFriendSatellite[] }>('/api/me/friend-satellites')
    },
    deleteFriendSatellite(id: string) {
      return request<{ deleted: true }>(`/api/me/friend-satellites/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
    async loadMoments() {
      const response = await request<{ moments: MusicMoment[] }>('/api/me/music-planet/moments')
      return response.moments
    },
    loadSocialSettings() {
      return request<MusicSocialSettings>('/api/me/social-settings')
    },
    updateMusicPlanet(patch: {
      visibility?: MusicPlanet['visibility']
      displayName?: string
      tagline?: string
      trackIds?: string[]
      primaryTrackId?: string
      appearanceOverrides?: DitherOverrides
      appearanceRevision?: number
    }) {
      return request<{ planet: MusicPlanet; compositionTask?: PlanetComposerTask }>('/api/me/music-planet', {
        method: 'PATCH', body: JSON.stringify(patch),
      })
    },
    updateMoment(momentId: string, patch: Partial<MusicMomentDraft>) {
      return request<{ moment: MusicMoment | null; compositionTask?: PlanetComposerTask }>(`/api/me/music-planet/moments/${encodeURIComponent(momentId)}`, {
        method: 'PATCH', body: JSON.stringify(patch),
      })
    },
    deleteMoment(momentId: string) {
      return request<{ deleted: boolean; compositionTask?: PlanetComposerTask }>(`/api/me/music-planet/moments/${encodeURIComponent(momentId)}`, {
        method: 'DELETE',
      })
    },
    findSongMatches(trackId: string) {
      return request<SongPortalResponse>(`/api/music/song-portal?trackId=${encodeURIComponent(trackId)}`)
    },
    async loadGalaxy(by: GalaxyGroupBy) {
      const response = await request<MusicGalaxyResponse>(`/api/music/galaxy?by=${encodeURIComponent(by)}`)
      return { ...response, groups: sampleGalaxyNodes(response.groups, dailyRandom(`${musicDayKey()}:galaxy:${by}`)) }
    },
    loadGalaxyContent(by: GalaxyGroupBy, key: string, offset = 0, signal?: AbortSignal) {
      return request<MusicGalaxyContent>(`/api/music/galaxy-content?${new URLSearchParams({ by, key, offset: String(offset) })}`, { signal })
    },
    loadDiscovery() {
      return request<MusicDiscoveryResponse>('/api/music/discovery')
    },
    loadOrbit() {
      return request<MusicOrbitResponse>('/api/me/orbit')
    },
    loadFriendRequests() {
      return request<MusicFriendRequestsResponse>('/api/me/friend-requests')
    },
    createFriendRequest(planetId: string) {
      return request<{ request: { id: string; status: 'pending' | 'accepted'; planetId: string } }>('/api/me/friend-requests', {
        method: 'POST', body: JSON.stringify({ planetId }),
      })
    },
    respondFriendRequest(requestId: string, action: 'accept' | 'reject') {
      return request<{ requestId: string; status: 'accepted' | 'rejected' }>(`/api/me/friend-requests/${encodeURIComponent(requestId)}`, {
        method: 'PATCH', body: JSON.stringify({ action }),
      })
    },
    blockPlanet(planetId: string) {
      return request<{ ok: true }>('/api/me/blocks', {
        method: 'POST', body: JSON.stringify({ planetId }),
      })
    },
    async loadBlocks(signal?: AbortSignal) {
      const response = await request<{ blocks: MusicUserBlock[] }>('/api/me/blocks', { signal })
      if (!response || !Array.isArray(response.blocks)) throw new MusicApiError(502, 'INVALID_BLOCK_LIST')
      return response.blocks
    },
    blockUser(userId: string) {
      return request<{ ok: true }>('/api/me/blocks', { method: 'POST', body: JSON.stringify({ userId }) })
    },
    unblockUser(userId: string) {
      return request<{ ok: true }>(`/api/me/blocks/${encodeURIComponent(userId)}`, { method: 'DELETE' })
    },
    unfriend(userId: string) {
      return request<{ ok: true }>(`/api/me/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' })
    },
    loadDirectMessages(userId: string, options: { before?: string; signal?: AbortSignal } = {}) {
      return request<MusicDirectMessagesResponse>(`/api/me/friends/${encodeURIComponent(userId)}/messages${options.before ? `?before=${encodeURIComponent(options.before)}` : ''}`, { signal: options.signal })
    },
    sendDirectMessage(userId: string, input: string | { contentText?: string; trackId?: string }) {
      return request<{ message: MusicDirectMessage }>(`/api/me/friends/${encodeURIComponent(userId)}/messages`, {
        method: 'POST', body: JSON.stringify(typeof input === 'string' ? { contentText: input } : input),
      })
    },
    sendDirectPhoto(userId: string, photo: File, contentText = '') {
      const body = new FormData(); body.append('photo', photo); body.append('contentText', contentText)
      return request<{ message: MusicDirectMessage }>(`/api/me/friends/${encodeURIComponent(userId)}/messages`, { method: 'POST', body })
    },
    hideDirectMessage(messageId: string) {
      return request<{ ok: true }>(`/api/me/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' })
    },
    loadDriftBottles() {
      return request<MusicDriftBottlesResponse>('/api/me/drift-bottles')
    },
    createDriftBottle(topic: MusicDriftBottleTopicInput, messageText: string) {
      return request<{ sentToday: true; bottle: { id: string; status: string; topic: unknown; createdAt: string } }>('/api/me/drift-bottles', {
        method: 'POST', body: JSON.stringify({ topic, messageText }),
      })
    },
    getDriftBottle(bottleId: string) {
      return request<MusicDriftBottleDetail>(`/api/me/drift-bottles/${encodeURIComponent(bottleId)}`)
    },
    updateDriftBottle(bottleId: string, action: 'open' | 'release') {
      return request<{ delivery?: { status: 'read' }; alreadyOpened?: boolean; released?: boolean; status?: string }>(`/api/me/drift-bottles/${encodeURIComponent(bottleId)}`, {
        method: 'PATCH', body: JSON.stringify({ action }),
      })
    },
    addDriftBottleComment(bottleId: string, contentText: string) {
      return request<{ comment: MusicDriftBottleComment }>(`/api/me/drift-bottles/${encodeURIComponent(bottleId)}/comments`, {
        method: 'POST', body: JSON.stringify({ contentText }),
      })
    },
    setDriftBottleCommentLike(bottleId: string, commentId: string, liked: boolean) {
      return request<{ liked: boolean; likeCount: number }>(`/api/me/drift-bottles/${encodeURIComponent(bottleId)}/comments/${encodeURIComponent(commentId)}/like`, {
        method: liked ? 'POST' : 'DELETE',
      })
    },
    deleteDriftBottleComment(bottleId: string, commentId: string) {
      return request<{ ok: true }>(`/api/me/drift-bottles/${encodeURIComponent(bottleId)}/comments/${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
      })
    },
    updateSocialSettings(settings: { allowFriendRequests?: boolean; allowDriftBottles?: boolean }) {
      return request<{ allowFriendRequests: boolean; allowDriftBottles: boolean }>('/api/me/social-settings', {
        method: 'PATCH', body: JSON.stringify(settings),
      })
    },
    reportContent(target: MusicReportTarget, reason: MusicReportReason, detail = '') {
      return request<{ report: { id: string; targetType: MusicReportTarget['type']; reason: MusicReportReason; status: 'open'; createdAt: string } }>('/api/me/reports', {
        method: 'POST', body: JSON.stringify({ target, reason, detail }),
      })
    },
    loadReportQueue(status: MusicReportQueueFilter = 'open', limit = 50, offset = 0) {
      const query = new URLSearchParams({ status, limit: String(limit), offset: String(offset) })
      return request<MusicReportQueueResponse>(`/api/admin/music-reports?${query.toString()}`)
    },
    reviewReport(reportId: string, status: Exclude<MusicReportStatus, 'open'>) {
      return request<{ report: MusicAdminReport }>(`/api/admin/music-reports/${encodeURIComponent(reportId)}`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      })
    },
    async loadPublicPlanet(planetId: string) {
      const response = await request<{ planet: PublicMusicPlanet }>(`/api/music/planets/${encodeURIComponent(planetId)}`)
      return response.planet
    },
    async visitPublicPlanet(planetId: string, isIncognito: boolean, source: MusicPlanetVisitSource = 'direct', trackId?: string) {
      const response = await request<{ planet: PublicMusicPlanet }>(`/api/music/planets/${encodeURIComponent(planetId)}/visit`, {
        method: 'POST', body: JSON.stringify({ isIncognito, source, ...(trackId ? { trackId } : {}) }),
      })
      return response.planet
    },
    createPlanet(draft: MusicPlanetDraft) {
      return request<{ planet: MusicPlanet; compositionTask?: PlanetComposerTask }>('/api/me/music-planet', {
        method: 'POST', body: JSON.stringify(draft),
      })
    },
    createMoment(draft: MusicMomentDraft & { photo?: File }) {
      if (draft.photo) {
        const body = new FormData()
        body.set('trackId', draft.trackId); body.set('contentText', draft.contentText); body.set('visibility', draft.visibility)
        body.set('photo', draft.photo)
        return request<{ moment: MusicMoment | null }>('/api/me/music-planet/moments', { method: 'POST', body })
      }
      return request<{ moment: MusicMoment | null; compositionTask?: PlanetComposerTask }>('/api/me/music-planet/moments', {
        method: 'POST', body: JSON.stringify(draft),
      })
    },
    composePlanet() {
      return request<{ task: PlanetComposerTask }>('/api/me/music-planet/compose', { method: 'POST' })
    },
    getComposerTask(taskId: string) {
      return request<{ task: PlanetComposerTask & {
        model: { name: string; version: string }
        result: MusicPlanetVisual | null
        errorCode: string | null
      } }>(`/api/me/music-planet/ai-tasks/${encodeURIComponent(taskId)}`)
    },
  }
}

export type MusicApi = ReturnType<typeof createMusicApi>
