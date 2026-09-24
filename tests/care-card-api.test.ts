import { beforeEach, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  localDate: vi.fn(),
  ownedPlanet: vi.fn(),
  preferredPlanet: vi.fn(),
  parseCheckIn: vi.fn(),
}))

vi.mock('../functions/_shared', () => ({
  json: (request: Request) => request.json(),
  session: mocks.session,
  withCookie: (body: unknown, _active: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  }),
}))

vi.mock('../functions/_planet', () => ({
  conflictCode: (error: unknown) => String(error).includes('DAILY_ENTRY_EXISTS') ? 'DAILY_ENTRY_EXISTS' : null,
  localDate: mocks.localDate,
  ownedPlanet: mocks.ownedPlanet,
  preferredPlanet: mocks.preferredPlanet,
  parseCheckIn: mocks.parseCheckIn,
}))

import { onRequestPost } from '../functions/api/me/check-ins'

type Statement = {
  sql: string
  values: unknown[]
  bind: (...values: unknown[]) => Statement
  first: () => Promise<unknown>
}

function context() {
  const statements: Statement[] = []
  let careValues: unknown[] = []
  const db = {
    prepare: vi.fn((sql: string) => {
      const statement: Statement = {
        sql,
        values: [],
        bind(...values) { this.values = values; return this },
        async first() {
          if (sql.includes('FROM care_cards')) {
            const [id, userId, planetId, recordDate, title, message, action, published, createdAt, expiresAt] = careValues
            return { id, userId, planetId, recordDate, title, message, action, published, createdAt, expiresAt }
          }
          return { id: 'planet-1', user_id: 'user-1', theme: 'study' }
        },
      }
      statements.push(statement)
      return statement
    }),
    batch: vi.fn(async (batch: Statement[]) => {
      careValues = batch.find((statement) => statement.sql.includes('INSERT INTO care_cards'))?.values ?? []
      return []
    }),
  }
  return { value: { request: new Request('https://moodverse.test/api/me/check-ins', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ planetId: 'planet-1', mood: 'anxious', intensity: 5, triggers: ['面试'] }),
  }), env: { DB: db } } as never, db, statements }
}

beforeEach(() => {
  mocks.session.mockResolvedValue({ userId: 'user-1', setCookie: null })
  mocks.localDate.mockResolvedValue('2026-09-24')
  mocks.ownedPlanet.mockResolvedValue({ id: 'planet-1', user_id: 'user-1', theme: 'study', archived_at: null })
  mocks.preferredPlanet.mockResolvedValue(null)
  mocks.parseCheckIn.mockReturnValue({
    mood: 'anxious', intensity: 5, privacy: 'private', triggersJson: '["面试"]',
    privateNote: '担心表现', publicMessage: '', musicUrl: '', doodleJson: '[]',
    hasPublicContent: false, billboardId: '',
  })
})

test('successful daily check-in writes and returns its private matched care card in the same D1 batch', async () => {
  const ctx = context()
  const response = await onRequestPost(ctx.value)
  const result = await response.json() as { careCard: Record<string, unknown> }
  const batch = ctx.db.batch.mock.calls[0]?.[0] as Statement[]
  const careInsert = batch.find((statement) => statement.sql.includes('INSERT INTO care_cards'))

  expect(response.status).toBe(201)
  expect(batch).toHaveLength(3)
  expect(careInsert?.values[3]).toBe('2026-09-24')
  expect(result.careCard).toMatchObject({ planetId: 'planet-1', recordDate: '2026-09-24', published: 0 })
  expect(result.careCard.title).toContain('眼前')
  expect(result.careCard.message).toContain('面试')
  expect(result.careCard.action).toContain('呼气')
})
