import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { onRequestGet as getMessages, onRequestPost as postMessage } from '../functions/api/me/friends/[userId]/messages'
import { onRequestDelete as hideMessage } from '../functions/api/me/messages/[id]'
import { onRequestPost as postBlock } from '../functions/api/me/blocks'
import { authenticatedMusicUser } from '../functions/_shared'
import type { Env } from '../functions/_shared'
import { createAccessTestAuthority } from './helpers/cloudflare-access-jwt'
import { createMusicApiEnv, createMusicApiFixture } from './helpers/music-api-fixture'

const issuer = 'https://music-dm-test.cloudflareaccess.com'
const audience = 'music-dm-test-audience'
let authority: Awaited<ReturnType<typeof createAccessTestAuthority>>
let fixture: ReturnType<typeof createMusicApiFixture>
let aliceId: string
let bobId: string

beforeAll(async () => { authority = await createAccessTestAuthority(issuer, audience) })
beforeEach(async () => {
  fixture = createMusicApiFixture()
  authority.installJwks()
  aliceId = await identityFor('dm-alice')
  bobId = await identityFor('dm-bob')
})
afterEach(() => fixture.close())

function env() {
  return createMusicApiEnv(fixture.db, { CF_ACCESS_TEAM_DOMAIN: issuer, CF_ACCESS_AUD: audience })
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

async function call(
  subject: string,
  path: string,
  handler: PagesFunction<Env>,
  options: { method?: string; body?: unknown; params?: Record<string, string> } = {},
) {
  const signed = await authority.request({ sub: subject, email: `${subject}@example.com` })
  const headers = new Headers(signed.headers)
  if (options.body !== undefined) headers.set('content-type', 'application/json')
  const request = new Request(`https://moodverse.test${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
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
