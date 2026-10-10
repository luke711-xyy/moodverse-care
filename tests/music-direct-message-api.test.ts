import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { onRequestGet as getMessages, onRequestPost as postMessage } from '../functions/api/me/friends/[userId]/messages'
import { onRequestDelete as hideMessage } from '../functions/api/me/messages/[id]'
import { onRequestGet as getPhoto } from '../functions/api/me/messages/[id]/photo'
import { onRequestPost as postBlock } from '../functions/api/me/blocks'
import { authenticatedMusicUser } from '../functions/_shared'
import type { Env } from '../functions/_shared'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'

const issuer = 'https://music-dm-test.cloudflareaccess.com'
const audience = 'music-dm-test-audience'
let authority: Awaited<ReturnType<typeof createAccessTestAuthority>>
let fixture: ReturnType<typeof createMusicApiFixture>
let aliceId: string
let bobId: string
let media: Map<string, Uint8Array>

beforeAll(async () => { authority = await createAccessTestAuthority(issuer, audience) })
beforeEach(async () => {
  fixture = createMusicApiFixture()
  media = new Map()
  authority.installJwks()
  aliceId = await identityFor('dm-alice')
  bobId = await identityFor('dm-bob')
})
afterEach(() => fixture.close())

function env() {
  return createMusicApiEnv(fixture.db, { CF_ACCESS_TEAM_DOMAIN: issuer, CF_ACCESS_AUD: audience, MUSIC_MEDIA: {
    put: async (key: string, bytes: Uint8Array) => { media.set(key, bytes) },
    get: async (key: string) => media.has(key) ? { body: media.get(key) } : null,
    delete: async (key: string) => { media.delete(key) },
  } as unknown as R2Bucket })
}

async function identityFor(subject: string) {
  const request = await authority.request({ sub: subject, email: `${subject}@example.com` })
  return (await authenticatedMusicUser(request, env()))!.userId
}

function becomeFriends(firstUserId = aliceId, secondUserId = bobId) {
  const [userA, userB] = [firstUserId, secondUserId].sort()
  fixture.sqlite.prepare(`
    INSERT INTO music_friendships (user_a_id, user_b_id, created_at)
    VALUES (?, ?, '2026-09-30T08:00:00.000Z')
  `).run(userA, userB)
}

test('encoded demo account routes read existing greetings and send to the same existing friend', async () => {
  const demoId='demo:user:long-way-home', encoded=encodeURIComponent(demoId)
  fixture.sqlite.prepare('INSERT INTO users (id, token_hash, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(demoId,'demo-disabled:'+demoId,'2026-10-10T00:00:00Z','2026-10-10T00:00:00Z')
  becomeFriends(aliceId,demoId)
  fixture.sqlite.prepare('INSERT INTO music_direct_messages (id, sender_user_id, recipient_user_id, content_text, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('demo:hello',demoId,aliceId,'归途的问候','2026-10-10T00:00:00Z')
  const response=await call('dm-alice',`/api/me/friends/${encoded}/messages`,getMessages,{params:{userId:encoded}})
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({peerUserId:demoId,messages:[{id:'demo:hello',contentText:'归途的问候'}]})
  const sent=await call('dm-alice',`/api/me/friends/${encoded}/messages`,postMessage,{method:'POST',params:{userId:encoded},body:{contentText:'收到'}})
  expect(sent.status).toBe(201)
  expect(fixture.sqlite.prepare("SELECT recipient_user_id FROM music_direct_messages WHERE content_text='收到'").get()).toEqual({recipient_user_id:demoId})
  // URL decoding must not bypass the friendship check for someone else.
  const outsider=await call('dm-bob',`/api/me/friends/${encoded}/messages`,getMessages,{params:{userId:encoded}})
  expect(outsider.status).toBe(403)
  fixture.sqlite.prepare('INSERT INTO music_user_blocks (blocker_user_id,blocked_user_id,created_at) VALUES (?,?,?)').run(aliceId,demoId,'2026-10-10T00:00:00Z')
  for(const [handler,method,body] of [[getMessages,'GET',undefined],[postMessage,'POST',{contentText:'不应发出'}]] as const){
    const blocked=await call('dm-alice',`/api/me/friends/${encoded}/messages`,handler,{method,body,params:{userId:encoded}})
    expect(blocked.status).toBe(403)
    expect(await blocked.json()).toEqual({error:'USER_BLOCKED'})
  }
  expect(fixture.sqlite.prepare('SELECT count(*) AS n FROM music_direct_messages').get()).toEqual({n:2})
})

test.each(['%broken','demo%2Fuser','demo%5Cuser','demo%00user',encodeURIComponent('x'.repeat(129))])('malformed conversation route %s is rejected before accessing messages',async userId=>{
  const response=await call('dm-alice',`/api/me/friends/${userId}/messages`,getMessages,{params:{userId}})
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({error:'INVALID_CONVERSATION'})
})

test('encoded message IDs preserve private photo access and per-participant hiding',async()=>{
  becomeFriends()
  const id='demo:message:photo',encoded=encodeURIComponent(id)
  fixture.sqlite.prepare('INSERT INTO music_direct_messages (id,sender_user_id,recipient_user_id,content_text,created_at) VALUES (?,?,?,?,?)').run(id,aliceId,bobId,'[图片]','2026-10-10T00:00:00Z')
  fixture.sqlite.prepare("INSERT INTO music_direct_message_attachments (message_id,kind,photo_key,content_type,byte_size) VALUES (?,'photo','private-photo','image/png',3)").run(id)
  media.set('private-photo',new Uint8Array([1,2,3]))
  const photo=await call('dm-bob',`/api/me/messages/${encoded}/photo`,getPhoto,{params:{id:encoded}})
  expect(photo.status).toBe(200)
  expect(new Uint8Array(await photo.arrayBuffer())).toEqual(new Uint8Array([1,2,3]))
  const outsider=await call('dm-outsider',`/api/me/messages/${encoded}/photo`,getPhoto,{params:{id:encoded}})
  expect(outsider.status).toBe(404)
  const hidden=await call('dm-bob',`/api/me/messages/${encoded}`,hideMessage,{method:'DELETE',params:{id:encoded}})
  expect(hidden.status).toBe(200)
  expect(fixture.sqlite.prepare('SELECT hidden_for_sender,hidden_for_recipient FROM music_direct_messages WHERE id=?').get(id)).toEqual({hidden_for_sender:0,hidden_for_recipient:1})
  const denied=await call('dm-bob',`/api/me/messages/${encoded}/photo`,getPhoto,{params:{id:encoded}})
  expect(denied.status).toBe(404)
})

async function call(
  subject: string,
  path: string,
  handler: PagesFunction<Env>,
  options: { method?: string; body?: unknown; params?: Record<string, string> } = {},
) {
  const signed = await authority.request({ sub: subject, email: `${subject}@example.com` })
  const headers = new Headers(signed.headers)
  if (options.body !== undefined && !(options.body instanceof FormData)) headers.set('content-type', 'application/json')
  const request = new Request(`https://moodverse.test${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: options.body instanceof FormData ? options.body : JSON.stringify(options.body) } : {}),
  })
  return handler({ request, env: env(), params: options.params ?? {} } as never)
}

test('only current friends can send or read messages, and opening the conversation marks incoming messages read', async () => {
  const denied = await call('dm-alice', `/api/me/friends/${bobId}/messages`, postMessage, {
    method: 'POST', params: { userId: bobId }, body: { contentText: '你好' },
  })
  expect(denied.status).toBe(403)
  expect(await denied.json()).toEqual({ error: 'FRIENDSHIP_REQUIRED' })

  becomeFriends()
  const sent = await call('dm-alice', `/api/me/friends/${bobId}/messages`, postMessage, {
    method: 'POST', params: { userId: bobId }, body: { contentText: '  听到这首歌时想起你。  ' },
  })
  expect(sent.status).toBe(201)
  expect(await sent.json()).toMatchObject({ message: { contentText: '听到这首歌时想起你。', readAt: null } })

  const received = await call('dm-bob', `/api/me/friends/${aliceId}/messages`, getMessages, {
    params: { userId: aliceId },
  })
  const conversation = await received.json() as { messages: Array<{ contentText: string; isOwn: boolean; readAt: string | null }> }
  expect(received.status).toBe(200)
  expect(conversation.messages).toHaveLength(1)
  expect(conversation.messages[0]).toMatchObject({ contentText: '听到这首歌时想起你。', isOwn: false })
  expect(conversation.messages[0].readAt).toEqual(expect.any(String))

  const senderView = await call('dm-alice', `/api/me/friends/${bobId}/messages`, getMessages, {
    params: { userId: bobId },
  })
  expect(await senderView.json()).toMatchObject({ messages: [expect.objectContaining({ isOwn: true, readAt: expect.any(String) })] })
})

test('message text must be non-empty and at most 2000 characters', async () => {
  becomeFriends()
  for (const contentText of ['', '  ', 'a'.repeat(2001)]) {
    const response = await call('dm-alice', `/api/me/friends/${bobId}/messages`, postMessage, {
      method: 'POST', params: { userId: bobId }, body: { contentText },
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'INVALID_MESSAGE' })
  }
  const atLimit = await call('dm-alice', `/api/me/friends/${bobId}/messages`, postMessage, {
    method: 'POST', params: { userId: bobId }, body: { contentText: '字'.repeat(2000) },
  })
  expect(atLimit.status).toBe(201)
})

test('a shared song is saved and resolved from the catalog, never from client-supplied metadata', async () => {
  becomeFriends()
  insertCatalogTrack(fixture.sqlite, { id: 'dm-song', title: '寄给你的歌' })
  const sent = await call('dm-alice', `/api/me/friends/${bobId}/messages`, postMessage, {
    method: 'POST', params: { userId: bobId }, body: { trackId: 'dm-song' },
  })
  expect(sent.status).toBe(201)
  const received = await call('dm-bob', `/api/me/friends/${aliceId}/messages`, getMessages, { params: { userId: aliceId } })
  expect(await received.json()).toMatchObject({ messages: [{ kind: 'song', track: { id: 'dm-song', title: '寄给你的歌' }, isOwn: false }] })
  const forged = await call('dm-alice', `/api/me/friends/${bobId}/messages`, postMessage, {
    method: 'POST', params: { userId: bobId }, body: { trackId: 'dm-song', audioUrl: 'https://untrusted.example/file' },
  })
  expect(forged.status).toBe(400)
})

test('history remains retrievable past one page with stable same-time ordering and no duplicates', async () => {
  becomeFriends()
  const insert = fixture.sqlite.prepare('INSERT INTO music_direct_messages(id,sender_user_id,recipient_user_id,content_text,created_at) VALUES(?,?,?,?,?)')
  for (let i = 0; i < 123; i++) insert.run(`history-${String(i).padStart(3, '0')}`, aliceId, bobId, `历史 ${i}`, '2026-10-10T00:00:00.000Z')
  const seen: string[] = []
  let before = ''
  do {
    const response = await call('dm-bob', `/api/me/friends/${aliceId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`, getMessages, { params: { userId: aliceId } })
    const body = await response.json() as { messages: Array<{ id: string }>; nextCursor: string | null }
    expect(body.messages.length).toBeLessThanOrEqual(50)
    seen.push(...body.messages.map(message => message.id))
    before = body.nextCursor ?? ''
  } while (before)
  expect(seen).toHaveLength(123)
  expect(new Set(seen).size).toBe(123)
})

const photoForm = (bytes = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]), type = 'image/png') => {
  const form = new FormData(); form.append('photo', new File([bytes], 'photo.png', { type })); return form
}
test('photos persist privately for both participants and deny third parties, hidden copies and removed friendships', async () => {
  becomeFriends()
  const sent = await call('dm-alice', `/api/me/friends/${bobId}/messages`, postMessage, { method: 'POST', params: { userId: bobId }, body: photoForm() })
  expect(sent.status).toBe(201)
  const { message } = await sent.json() as { message: { id: string; photoUrl: string } }
  expect(media.size).toBe(1)
  const received = await call('dm-bob', `/api/me/friends/${aliceId}/messages`, getMessages, { params: { userId: aliceId } })
  expect(await received.json()).toMatchObject({ messages: [{ kind: 'photo', photoUrl: message.photoUrl }] })
  for (const subject of ['dm-alice','dm-bob']) {
    const photo = await call(subject, message.photoUrl, getPhoto, { params: { id: message.id } })
    expect(photo.status).toBe(200); expect(photo.headers.get('cache-control')).toBe('private, no-store'); expect((await photo.arrayBuffer()).byteLength).toBe(24)
  }
  expect((await call('dm-charlie', message.photoUrl, getPhoto, { params: { id: message.id } })).status).toBe(404)
  await call('dm-alice', '/hide', hideMessage, { method: 'DELETE', params: { id: message.id } })
  expect((await call('dm-alice', message.photoUrl, getPhoto, { params: { id: message.id } })).status).toBe(404)
  expect((await call('dm-bob', message.photoUrl, getPhoto, { params: { id: message.id } })).status).toBe(200)
  fixture.sqlite.prepare('INSERT INTO music_user_blocks(blocker_user_id,blocked_user_id,created_at) VALUES(?,?,?)').run(aliceId,bobId,new Date().toISOString())
  expect((await call('dm-bob', message.photoUrl, getPhoto, { params: { id: message.id } })).status).toBe(404)
  fixture.sqlite.prepare('DELETE FROM music_user_blocks').run()
  fixture.sqlite.prepare('DELETE FROM music_friendships').run()
  expect((await call('dm-bob', message.photoUrl, getPhoto, { params: { id: message.id } })).status).toBe(404)
})
test('photo uploads reject the exact 10 MB boundary, spoofed content and unsupported SVG without storing objects', async () => {
  becomeFriends()
  for (const [body, status] of [[photoForm(new Uint8Array(10*1024*1024)),413], [photoForm(new TextEncoder().encode('<html>not an image</html>')),400], [photoForm(new TextEncoder().encode('<svg/>'),'image/svg+xml'),400]] as const) {
    const response = await call('dm-alice', '/send', postMessage, { method: 'POST', params: { userId: bobId }, body })
    expect(response.status).toBe(status)
  }
  expect(media.size).toBe(0)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_direct_messages').get()).toEqual({ count: 0 })
})
test('an attachment database failure rolls back its message and removes the uploaded private object', async () => {
  becomeFriends()
  fixture.sqlite.exec("CREATE TRIGGER fail_attachment BEFORE INSERT ON music_direct_message_attachments BEGIN SELECT RAISE(ABORT, 'injected failure'); END")
  await expect(call('dm-alice', '/send', postMessage, { method: 'POST', params: { userId: bobId }, body: photoForm() })).rejects.toThrow('injected failure')
  expect(media.size).toBe(0)
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_direct_messages').get()).toEqual({ count: 0 })
})

test('direct-message rate limit is account-wide across all friend conversations', async () => {
  const charlieId = await identityFor('dm-charlie')
  becomeFriends(aliceId, bobId)
  becomeFriends(aliceId, charlieId)

  for (let index = 0; index < 30; index += 1) {
    const peer = index % 2 === 0 ? bobId : charlieId
    const subject = index % 2 === 0 ? 'dm-bob' : 'dm-charlie'
    const response = await call('dm-alice', `/api/me/friends/${peer}/messages`, postMessage, {
      method: 'POST', params: { userId: peer }, body: { contentText: `第 ${index + 1} 条消息` },
    })
    expect(response.status, `message ${index + 1} to ${subject}`).toBe(201)
  }

  const overLimit = await call('dm-alice', `/api/me/friends/${charlieId}/messages`, postMessage, {
    method: 'POST', params: { userId: charlieId }, body: { contentText: '跨聊天也不能绕过限额。' },
  })
  expect(overLimit.status).toBe(429)
  expect(await overLimit.json()).toEqual({ error: 'MESSAGE_RATE_LIMITED' })
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_direct_messages WHERE sender_user_id = ?').get(aliceId))
    .toEqual({ count: 30 })
})

test('hiding a message is private to the participant and friendship removal immediately denies conversation access', async () => {
  becomeFriends()
  const sent = await call('dm-alice', `/api/me/friends/${bobId}/messages`, postMessage, {
    method: 'POST', params: { userId: bobId }, body: { contentText: '只隐藏在我这里。' },
  })
  const { message } = await sent.json() as { message: { id: string } }

  const hidden = await call('dm-alice', `/api/me/messages/${message.id}`, hideMessage, {
    method: 'DELETE', params: { id: message.id },
  })
  expect(hidden.status).toBe(200)
  const aliceView = await call('dm-alice', `/api/me/friends/${bobId}/messages`, getMessages, { params: { userId: bobId } })
  const bobView = await call('dm-bob', `/api/me/friends/${aliceId}/messages`, getMessages, { params: { userId: aliceId } })
  expect((await aliceView.json() as { messages: unknown[] }).messages).toHaveLength(0)
  expect((await bobView.json() as { messages: Array<{ contentText: string }> }).messages).toMatchObject([{ contentText: '只隐藏在我这里。' }])

  fixture.sqlite.prepare('DELETE FROM music_friendships WHERE user_a_id = ? AND user_b_id = ?').run(...[aliceId, bobId].sort())
  const afterUnfriend = await call('dm-bob', `/api/me/friends/${aliceId}/messages`, getMessages, { params: { userId: aliceId } })
  expect(afterUnfriend.status).toBe(403)
  expect(await afterUnfriend.json()).toEqual({ error: 'FRIENDSHIP_REQUIRED' })
})

test('blocking an existing friend immediately denies both conversation reads and sends', async () => {
  becomeFriends()
  fixture.sqlite.prepare(`
    INSERT INTO music_planets (id, owner_user_id, display_name, tagline, visibility, created_at, updated_at)
    VALUES ('dm-bob-planet', ?, 'Bob 星球', '', 'public', '2026-09-30T08:00:00.000Z', '2026-09-30T08:00:00.000Z')
  `).run(bobId)
  const blocked = await call('dm-alice', '/api/me/blocks', postBlock, {
    method: 'POST', body: { planetId: 'dm-bob-planet' },
  })
  expect(blocked.status).toBe(200)

  for (const [handler, method, body] of [[getMessages, 'GET', undefined], [postMessage, 'POST', { contentText: '消息不应发出。' }]] as const) {
    const response = await call('dm-bob', `/api/me/friends/${aliceId}/messages`, handler, {
      method, body, params: { userId: aliceId },
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'USER_BLOCKED' })
  }
  expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM music_direct_messages').get()).toEqual({ count: 0 })
})
