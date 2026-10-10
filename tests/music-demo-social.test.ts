import { afterEach, beforeEach, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { createMusicApiFixture } from './helpers/music-api-fixture'
import { autoAcceptDemoRequest, demoGreetingStatements, demoWelcomeStatements, processDemoSocialQueue } from '../functions/_music-demo-social'

let fixture: ReturnType<typeof createMusicApiFixture>
const now = '2026-10-10T00:00:00.000Z'
const later = '2026-10-10T02:00:00.000Z'
const env = () => ({ DB: fixture.db, MUSIC_DEMO_SOCIAL_ENABLED: 'true' })
function user(id: string, demo = false) {
  fixture.sqlite.prepare('INSERT INTO users (id, token_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, demo ? `demo-disabled:${id}` : `real:${id}`, now, now)
  fixture.sqlite.prepare("INSERT INTO music_planets (id, owner_user_id, display_name, tagline, visibility, created_at, updated_at) VALUES (?, ?, ?, '', 'public', ?, ?)").run(`p:${id}`, id, id, now, now)
  if (demo) fixture.sqlite.prepare('INSERT INTO music_demo_actors (user_id, identity_marker, greeting) VALUES (?, ?, ?)').run(id, `demo-disabled:${id}`, `来自${id}的固定问候。`)
}
function request(id: string, from: string, to: string, status = 'pending') {
  fixture.sqlite.prepare('INSERT INTO music_friend_requests (id, requester_user_id, recipient_user_id, planet_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, from, to, `p:${to}`, status, now, now)
}
const count = (table: string) => (fixture.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
beforeEach(() => {
  fixture = createMusicApiFixture()
  user('real'); user('other'); user('demo:a', true); user('demo:b', true); user('demo:c', true)
})
afterEach(() => fixture.close())

test('registry migration recognizes prefixed demo names, remains idempotent, and excludes login-capable lookalikes', () => {
  fixture.sqlite.prepare("UPDATE music_planets SET display_name = '演示·雾中航线' WHERE owner_user_id = 'demo:a'").run()
  user('demo:fake')
  const migration = readFileSync(new URL('../migrations-music-staging/0006_demo_social.sql', import.meta.url), 'utf8')
  fixture.sqlite.exec(migration); fixture.sqlite.exec(migration)
  expect(fixture.sqlite.prepare("SELECT greeting FROM music_demo_actors WHERE user_id = 'demo:a'").get()).toEqual({ greeting: '这里是雾中航线。愿这段旋律陪你穿过雾，慢慢靠岸。\n（示例星球的固定问候，无需回复。）' })
  expect(fixture.sqlite.prepare("SELECT user_id FROM music_demo_actors WHERE user_id = 'demo:fake'").get()).toBeUndefined()
  expect(count('music_demo_welcome_jobs')).toBe(0)
})

test('creation enrolls exactly two distinct delayed invitations once, not existing users or demos', async () => {
  expect(count('music_demo_welcome_jobs')).toBe(0)
  await fixture.db.batch(demoWelcomeStatements(env(), 'real', 'p:real', now))
  await fixture.db.batch(demoWelcomeStatements(env(), 'real', 'p:real', now))
  await fixture.db.batch(demoWelcomeStatements(env(), 'demo:a', 'p:demo:a', now))
  const jobs = fixture.sqlite.prepare('SELECT actor_user_id, slot, due_at FROM music_demo_welcome_jobs ORDER BY slot').all() as { actor_user_id: string; slot: number; due_at: string }[]
  expect(jobs).toHaveLength(2)
  expect(new Set(jobs.map(j => j.actor_user_id)).size).toBe(2)
  expect(Date.parse(jobs[0].due_at) - Date.parse(now)).toBeGreaterThanOrEqual(5 * 60_000)
  expect(Date.parse(jobs[0].due_at) - Date.parse(now)).toBeLessThanOrEqual(15 * 60_000)
  expect(Date.parse(jobs[1].due_at) - Date.parse(now)).toBeGreaterThanOrEqual(30 * 60_000)
  expect(Date.parse(jobs[1].due_at) - Date.parse(now)).toBeLessThanOrEqual(60 * 60_000)
  await processDemoSocialQueue(env(), now)
  expect(count('music_friend_requests')).toBe(0)
  await Promise.all([processDemoSocialQueue(env(), later), processDemoSocialQueue(env(), later)])
  expect(count('music_friend_requests')).toBe(2)
  expect(count('music_friendships')).toBe(0)
  expect(count('music_direct_messages')).toBe(0)
  expect(fixture.sqlite.prepare("SELECT count(*) AS n FROM music_friend_requests WHERE recipient_user_id = 'other'").get()).toEqual({ n: 0 })
  await processDemoSocialQueue(env(), later)
  expect(count('music_friend_requests')).toBe(2)
})

test.each(['blocked', 'rejected', 'disabled', 'private', 'friend'])('queued invites honor %s at delivery and never retry', async reason => {
  await fixture.db.batch(demoWelcomeStatements(env(), 'real', 'p:real', now))
  const jobs = fixture.sqlite.prepare('SELECT actor_user_id FROM music_demo_welcome_jobs').all() as { actor_user_id: string }[]
  for (const { actor_user_id: actor } of jobs) {
    if (reason === 'blocked') fixture.sqlite.prepare('INSERT INTO music_user_blocks (blocker_user_id, blocked_user_id, created_at) VALUES (?, ?, ?)').run('real', actor, now)
    if (reason === 'rejected') request(`declined:${actor}`, actor, 'real', 'rejected')
    if (reason === 'friend') fixture.sqlite.prepare('INSERT INTO music_friendships VALUES (?, ?, ?)').run(...['real', actor].sort(), now)
  }
  if (reason === 'disabled') fixture.sqlite.prepare('INSERT INTO music_social_preferences (user_id, allow_friend_requests, updated_at) VALUES (?, 0, ?)').run('real', now)
  if (reason === 'private') fixture.sqlite.prepare("UPDATE music_planets SET visibility = 'private' WHERE owner_user_id = 'real'").run()
  await processDemoSocialQueue(env(), later)
  expect(fixture.sqlite.prepare("SELECT count(*) AS n FROM music_demo_welcome_jobs WHERE status = 'skipped'").get()).toEqual({ n: 2 })
  expect(fixture.sqlite.prepare("SELECT count(*) AS n FROM music_friend_requests WHERE status = 'pending'").get()).toEqual({ n: 0 })
})

test('real to demo automatically accepts atomically and greets exactly once even on concurrent retry or re-friending', async () => {
  request('r1', 'real', 'demo:a')
  await Promise.all([autoAcceptDemoRequest(env(), 'r1', now), autoAcceptDemoRequest(env(), 'r1', now)])
  expect(count('music_friendships')).toBe(1)
  expect(fixture.sqlite.prepare("SELECT status FROM music_friend_requests WHERE id = 'r1'").get()).toEqual({ status: 'accepted' })
  expect(fixture.sqlite.prepare('SELECT sender_user_id, recipient_user_id, content_text FROM music_direct_messages').all()).toEqual([{ sender_user_id: 'demo:a', recipient_user_id: 'real', content_text: '来自demo:a的固定问候。' }])
  fixture.sqlite.exec('DELETE FROM music_direct_messages; DELETE FROM music_friendships')
  fixture.sqlite.prepare("UPDATE music_friend_requests SET status = 'pending' WHERE id = 'r1'").run()
  await autoAcceptDemoRequest(env(), 'r1', later)
  expect(count('music_friendships')).toBe(1)
  expect(count('music_direct_messages')).toBe(0)
  expect(count('music_demo_greetings')).toBe(1)
})

test('normal real-user requests and unregistered lookalike accounts are never auto-accepted', async () => {
  user('demo:fake')
  request('real-r', 'real', 'other'); request('fake-r', 'real', 'demo:fake')
  await autoAcceptDemoRequest(env(), 'real-r', now); await autoAcceptDemoRequest(env(), 'fake-r', now)
  expect(count('music_friendships')).toBe(0)
  expect(count('music_direct_messages')).toBe(0)
})

test('a demo-to-real invitation stays pending across repeated automatic queue runs', async () => {
  request('demo:incoming','demo:a','real')
  expect(await autoAcceptDemoRequest(env(),'demo:incoming',later)).toBe(false)
  await processDemoSocialQueue(env(),later)
  await processDemoSocialQueue(env(),later)
  expect(fixture.sqlite.prepare("SELECT status,responded_at FROM music_friend_requests WHERE id='demo:incoming'").get()).toEqual({status:'pending',responded_at:null})
  expect(count('music_friendships')).toBe(0)
  expect(count('music_direct_messages')).toBe(0)
})

test('existing pending real-to-demo requests are processed, but existing friends are never mass-greeted', async () => {
  request('old-r', 'real', 'demo:a')
  fixture.sqlite.prepare('INSERT INTO music_friendships VALUES (?, ?, ?)').run('demo:b', 'other', now)
  await processDemoSocialQueue(env(), later)
  expect(count('music_friendships')).toBe(2)
  expect(count('music_direct_messages')).toBe(1)
})

test('acceptance of a demo invitation sends a fixed greeting, later user messages cause no replies', async () => {
  request('incoming', 'demo:a', 'real', 'accepted')
  fixture.sqlite.prepare('INSERT INTO music_friendships VALUES (?, ?, ?)').run('demo:a', 'real', now)
  await fixture.db.batch(demoGreetingStatements(env(), 'demo:a', 'real', 'incoming', now))
  await fixture.db.batch(demoGreetingStatements(env(), 'demo:a', 'real', 'incoming', now))
  fixture.sqlite.prepare('INSERT INTO music_direct_messages (id, sender_user_id, recipient_user_id, content_text, created_at) VALUES (?, ?, ?, ?, ?)').run('reply', 'real', 'demo:a', '你好', now)
  await processDemoSocialQueue(env(), later)
  expect(count('music_direct_messages')).toBe(2)
})

test('block, disabled actor, and private actor prevent automatic acceptance and greeting', async () => {
  request('r1', 'real', 'demo:a'); request('r2', 'real', 'demo:b'); request('r3', 'real', 'demo:c')
  fixture.sqlite.prepare('INSERT INTO music_user_blocks VALUES (?, ?, ?)').run('real', 'demo:a', now)
  fixture.sqlite.prepare('INSERT INTO music_social_preferences (user_id, allow_friend_requests, updated_at) VALUES (?, 0, ?)').run('demo:b', now)
  fixture.sqlite.prepare("UPDATE music_planets SET visibility = 'private' WHERE owner_user_id = 'demo:c'").run()
  await processDemoSocialQueue(env(), later)
  expect(count('music_friendships')).toBe(0)
  expect(count('music_direct_messages')).toBe(0)
})

test('failed greeting transaction leaves neither friendship nor accepted request and retries cleanly', async () => {
  request('r1', 'real', 'demo:a')
  fixture.sqlite.exec("CREATE TRIGGER fail_greeting BEFORE INSERT ON music_direct_messages BEGIN SELECT RAISE(ABORT, 'test failure'); END")
  await expect(autoAcceptDemoRequest(env(), 'r1', now)).rejects.toThrow('test failure')
  expect(count('music_friendships')).toBe(0)
  expect(fixture.sqlite.prepare("SELECT status FROM music_friend_requests WHERE id = 'r1'").get()).toEqual({ status: 'pending' })
  fixture.sqlite.exec('DROP TRIGGER fail_greeting')
  await autoAcceptDemoRequest(env(), 'r1', now)
  expect(count('music_friendships')).toBe(1)
  expect(count('music_direct_messages')).toBe(1)
})

test('feature switch stops all work and deleting a user cascades jobs and greeting records', async () => {
  request('r1', 'real', 'demo:a')
  const off = { ...env(), MUSIC_DEMO_SOCIAL_ENABLED: 'false' }
  expect(demoWelcomeStatements(off, 'real', 'p:real', now)).toEqual([])
  await processDemoSocialQueue(off, later)
  expect(count('music_friendships')).toBe(0)
  await fixture.db.batch(demoWelcomeStatements(env(), 'real', 'p:real', now))
  await autoAcceptDemoRequest(env(), 'r1', now)
  fixture.sqlite.prepare("DELETE FROM users WHERE id = 'real'").run()
  expect(count('music_demo_welcome_enrollments')).toBe(0)
  expect(count('music_demo_welcome_jobs')).toBe(0)
  expect(count('music_demo_greetings')).toBe(0)
  expect(fixture.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
