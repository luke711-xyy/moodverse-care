import assert from 'node:assert/strict'

// Writes ONLY new, clearly labelled QA accounts. Never touches an existing user.
const base = new URL(process.argv[2] ?? 'http://localhost:5180')
assert.ok(['localhost', '127.0.0.1', 'moodverse-music-staging.pages.dev'].includes(base.hostname), 'Only local or isolated staging is allowed')
assert.ok(process.argv.includes('--confirm-qa-accounts'), 'Pass --confirm-qa-accounts; this check creates two QA planets, then makes them private')
const checks = []
function client() {
  let cookie = ''
  return async (path, body, method = body ? 'POST' : 'GET', expected = 200) => {
    const res = await fetch(new URL(path, base), { method, redirect: 'error', headers: {
      accept: 'application/json', origin: base.origin, ...(cookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) })
    for (const value of res.headers.getSetCookie()) {
      if (value.startsWith('mv_session=')) cookie = value.split(';')[0]
    }
    const result = await res.json()
    assert.equal(res.status, expected, `${method} ${path}: ${result.error ?? res.status}`)
    return result
  }
}
const a = client(), b = client(), momentIds = []
let createdA = false, createdB = false
try {
  const [emptyA, emptyB] = await Promise.all([a('/api/me/music-planet'), b('/api/me/music-planet')])
  assert.equal(emptyA.planet, null); assert.equal(emptyB.planet, null)
  assert.equal(emptyA.friendSatellites.length, 3); assert.equal(emptyB.friendSatellites.length, 3)
  checks.push('separate anonymous identities and 3 default friend satellites')
  const { tracks } = await a('/api/music/catalog')
  assert.ok(tracks.length >= 4)
  const trackIds = tracks.slice(-4, -1).map(t => t.id), alternate = tracks.at(-1).id
  const label = `QA二维${Date.now().toString(36)}`
  const make = (suffix) => ({ displayName: `${label}${suffix}`, tagline: '隔离验证账号，不是真实访客', trackIds })
  let pa = (await a('/api/me/music-planet', make('A'), 'POST', 201)).planet; createdA = true
  const pb = (await b('/api/me/music-planet', make('B'), 'POST', 201)).planet; createdB = true
  assert.notEqual(pa.id, pb.id); assert.equal(pa.visual.schemaVersion, 3)
  assert.equal((await a('/api/me/music-planet')).planet.id, pa.id)
  checks.push('immediate deterministic creation and persistent device identity')
  const originalVisual = JSON.stringify(pa.visual)
  for (const visibility of ['public', 'private']) {
    const result = await a('/api/me/music-planet/moments', { trackId: trackIds[0], contentText: `QA-${visibility}`, visibility }, 'POST', 201)
    momentIds.push(result.moment.id)
    assert.equal(result.compositionTask, undefined)
  }
  const publicA = (await b(`/api/music/planets/${pa.id}`)).planet
  assert.equal(publicA.moments.length, 1); assert.equal(publicA.moments[0].visibility, 'public')
  assert.equal(JSON.stringify(publicA.visual), originalVisual)
  assert.equal(JSON.stringify((await a('/api/me/music-planet')).planet.visual), originalVisual)
  checks.push('private Moment isolation and no text-driven visual/AI mutation')
  pa = (await a('/api/me/music-planet', { appearanceOverrides: { motif: 'score', speed: .4 }, appearanceRevision: pa.appearanceRevision }, 'PATCH')).planet
  assert.equal(pa.visual.overrides.motif, 'score')
  await a('/api/me/music-planet', { appearanceOverrides: { size: 200 } }, 'PATCH', 400)
  await a('/api/me/music-planet', { appearanceOverrides: { motif: 'dust' }, appearanceRevision: pa.appearanceRevision - 1 }, 'PATCH', 409)
  pa = (await a('/api/me/music-planet', { trackIds: [trackIds[0], alternate], primaryTrackId: alternate, appearanceRevision: pa.appearanceRevision }, 'PATCH')).planet
  assert.equal(pa.visual.overrides.motif, 'score')
  assert.equal(pa.visual.overrides.speed, .4)
  checks.push('bounded overrides, revision conflicts, persistence across song changes')
  const composed = await a('/api/me/music-planet/compose', {})
  assert.equal(composed.mode, 'deterministic'); assert.equal(composed.task, undefined)
  const visited = (await b(`/api/music/planets/${pa.id}/visit`, { isIncognito: false, source: 'galaxy' })).planet
  assert.deepEqual(visited.visual, pa.visual)
  const galaxy = await b('/api/music/galaxy?by=song')
  const card = galaxy.groups.flatMap(g => g.planets).find(p => p.planetId === pa.id)
  assert.deepEqual(card?.visual, pa.visual)
  const orbit = await b('/api/me/orbit')
  assert.deepEqual(orbit.groups.visitedByMe.find(p => p.planetId === pa.id)?.visual, pa.visual)
  const portal = await b(`/api/music/song-portal?trackId=${encodeURIComponent(trackIds[0])}`)
  assert.ok(portal.matches.some(p => p.planetId === pa.id))
  checks.push('public, Galaxy, Orbit and exact-song portal parity')
  const request = (await b('/api/me/friend-requests', { planetId: pa.id }, 'POST', 201)).request
  const incoming = await a('/api/me/friend-requests')
  const peerB = incoming.incoming.find(r => r.id === request.id).userId
  await a(`/api/me/friends/${peerB}/messages`, { contentText: 'not-yet-friends' }, 'POST', 403)
  await a(`/api/me/friend-requests/${request.id}`, { action: 'accept' }, 'PATCH')
  const peerA = (await b('/api/me/orbit')).groups.friends.find(p => p.planetId === pa.id).userId
  await b(`/api/me/friends/${peerA}/messages`, { contentText: '二维改造验收私信' }, 'POST', 201)
  assert.equal((await a(`/api/me/friends/${peerB}/messages`)).messages.at(-1).contentText, '二维改造验收私信')
  assert.ok((await a('/api/me/friend-satellites')).friendSatellites.length >= 4)
  await a('/api/me/drift-bottles')
  await a('/api/music/discovery')
  checks.push('friend request, friend-only DM, real friend satellite and social reads')
  console.log(JSON.stringify({ ok: true, origin: base.origin, checks }, null, 2))
} finally {
  for (const id of momentIds) await a(`/api/me/music-planet/moments/${id}`, undefined, 'DELETE')
  if (createdA) await a('/api/me/music-planet', { visibility: 'private' }, 'PATCH')
  if (createdB) await b('/api/me/music-planet', { visibility: 'private' }, 'PATCH')
}
