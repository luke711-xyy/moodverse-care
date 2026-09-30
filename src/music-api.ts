import type { MusicTrackSummary, MomentVisibility } from './music-domain'

export type MusicPlanetVisual = {
  schemaVersion: number
  summary: string
  palette: { surface: string; ocean: string; accent: string }
  atmosphere: 'clear' | 'mist' | 'nebula' | 'starlit'
  motion: 'still' | 'drift' | 'flow' | 'pulse'
  particleDensity: number
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
  visual: MusicPlanetVisual | Record<string, unknown>
  createdAt: string
  updatedAt: string
  tracks: MusicPlanetTrack[]
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

export type PublicMusicPlanet = MusicPlanet & { moments: MusicMoment[] }

export type SongPortalMatch = {
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

export type MusicDiscoveryResponse = {
  ranking: {
    mode: 'model' | 'stable_fallback'
    status: 'ready' | 'not_configured' | 'no_candidates' | 'no_query_signals' | 'gateway_unavailable' | 'invalid_output' | 'input_changed'
    model: { name: string; version: string } | null
    taskId: string | null
  }
  recommendations: Array<{
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
}

export type MusicOrbitResponse = {
  date: string
  groups: {
    songEncounters: MusicOrbitCard[]
    friends: Array<Omit<MusicOrbitCard, 'planetId'> & { userId: string; planetId: string | null; canVisit: boolean; unreadCount: number }>
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
}

export type MusicFriendRequestsResponse = {
  incoming: MusicFriendRequestCard[]
  outgoing: MusicFriendRequestCard[]
}

export type MusicDirectMessage = {
  id: string
  contentText: string
  createdAt: string
  readAt: string | null
  isOwn: boolean
}

export type MusicDirectMessagesResponse = {
  peerUserId: string
  messages: MusicDirectMessage[]
}

export type MusicDriftBottleTopicInput =
  | { type: 'song'; trackId: string }
  | { type: 'info'; title: string; url: string; summary: string }
  | { type: 'moment'; momentId: string }

export type MusicDriftBottleTopic =
  | { type: 'song'; track: { id: string; title: string; artistName: string; officialUrl: string | null; coverUrl: string | null; versionLabel: string } | null }
  | { type: 'info'; title: string; url: string; summary: string }
  | { type: 'moment'; momentId: string | null; contentText: string; track: { id: string; title: string; artistName: string; officialUrl: string | null; coverUrl: string | null } | null }

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
}

export type MusicSocialSettings = {
  allowFriendRequests: boolean
  allowDriftBottles: boolean
}

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

export function createMusicApi(fetcher: typeof fetch = fetch) {
  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetcher(url, {
      ...init,
      credentials: init?.credentials ?? 'same-origin',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
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
    requestEmailCode(email: string) {
      return request<{ ok: true }>('/api/auth/email/request', {
        method: 'POST', body: JSON.stringify({ email }),
      })
    },
    verifyEmailCode(email: string, code: string) {
      return request<{ authenticated: true; email: string }>('/api/auth/email/verify', {
        method: 'POST', body: JSON.stringify({ email, code }),
      })
    },
    logout() {
      return request<{ ok: true }>('/api/auth/logout', { method: 'POST' })
    },
    requestAccountDeletionCode() {
      return request<{ ok: true }>('/api/me/account/deletion-code', { method: 'POST' })
    },
    deleteAccount(code: string, confirmation: 'DELETE') {
      return request<{ ok: true }>('/api/me/account', {
        method: 'DELETE', body: JSON.stringify({ code, confirmation }),
      })
    },
    async loadHome() {
      const [catalog, owned] = await Promise.all([
        request<{ tracks: MusicTrackSummary[] }>('/api/music/catalog'),
        request<{ planet: MusicPlanet | null; isDemoAccount?: boolean }>('/api/me/music-planet'),
      ])
      return { tracks: catalog.tracks, planet: owned.planet, isDemoAccount: owned.isDemoAccount === true }
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
    loadGalaxy(by: GalaxyGroupBy) {
      return request<MusicGalaxyResponse>(`/api/music/galaxy?by=${encodeURIComponent(by)}`)
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
      return request<{ request: { id: string; status: 'pending'; planetId: string } }>('/api/me/friend-requests', {
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
    unblockUser(userId: string) {
      return request<{ ok: true }>(`/api/me/blocks/${encodeURIComponent(userId)}`, { method: 'DELETE' })
    },
    unfriend(userId: string) {
      return request<{ ok: true }>(`/api/me/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' })
    },
    loadDirectMessages(userId: string) {
      return request<MusicDirectMessagesResponse>(`/api/me/friends/${encodeURIComponent(userId)}/messages`)
    },
    sendDirectMessage(userId: string, contentText: string) {
      return request<{ message: MusicDirectMessage }>(`/api/me/friends/${encodeURIComponent(userId)}/messages`, {
        method: 'POST', body: JSON.stringify({ contentText }),
      })
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
    createMoment(draft: MusicMomentDraft) {
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
