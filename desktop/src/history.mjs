import { DatabaseSync } from 'node:sqlite'
import { chmodSync } from 'node:fs'
import { join } from 'node:path'

export const radioScope = 'radio'
const dayMs = 86400000

export function todayRange(now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export function openHistory(directory, legacy = []) {
  const file = join(directory, 'history.sqlite')
  const database = new DatabaseSync(file)
  chmodSync(file, 0o600)
  database.exec(`
    PRAGMA secure_delete=ON;
    CREATE TABLE IF NOT EXISTS messages (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL,
      at INTEGER NOT NULL, request_id TEXT, payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_period ON messages(scope, at, seq);
    CREATE INDEX IF NOT EXISTS messages_request ON messages(scope, request_id);
  `)
  const insert = database.prepare('INSERT INTO messages(scope, at, request_id, payload) VALUES (?, ?, ?, ?)')
  function append(scope, messages, requestId = null) {
    for (const message of messages) {
      insert.run(scope, message.at ?? Date.parse(message.createdAt), requestId, JSON.stringify(message))
    }
  }
  function transaction(fn) {
    database.exec('BEGIN IMMEDIATE')
    try { fn(); database.exec('COMMIT') }
    catch (error) { database.exec('ROLLBACK'); throw error }
  }
  // The database version and copied rows commit together. A restart between this
  // commit and removal of the legacy JSON field cannot duplicate a conversation.
  if (!database.prepare('PRAGMA user_version').get().user_version) {
    transaction(() => {
      append(radioScope, legacy)
      database.exec('PRAGMA user_version=1')
    })
  }
  const unpack = row => JSON.parse(row.payload)
  const pageQuery = database.prepare(`SELECT seq, at, payload FROM messages
    WHERE scope = ? AND at >= ? AND at < ? AND (at, seq) < (?, ?)
    ORDER BY at DESC, seq DESC LIMIT 101`)
  function page(scope, {start, end, cursor}) {
    const from = Date.parse(start), to = Date.parse(end)
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to || to-from > 367*dayMs)
      throw new Error('无效的记录日期。')
    let time = to, seq = 0
    if (cursor !== undefined && cursor !== null) {
      if (typeof cursor !== 'string' || !/^\d{1,15}:\d{1,16}$/.test(cursor)) throw new Error('无效的记录位置。')
      ;[time, seq] = cursor.split(':').map(Number)
      if (!Number.isSafeInteger(seq) || time < from || time >= to || seq < 1) throw new Error('无效的记录位置。')
    }
    const rows = pageQuery.all(scope, from, to, time, seq)
    const older = rows.length > 100
    if (older) rows.pop()
    const first = rows.at(-1)
    return {messages: rows.map(unpack).reverse(), nextCursor: older ? first.at + ':' + first.seq : null}
  }
  const todayQuery = database.prepare(`SELECT payload FROM messages WHERE scope=? AND at>=? AND at<?
    ORDER BY at DESC, seq DESC LIMIT ?`)
  return {
    page,
    today(scope, limit = -1, now) {
      const {start, end} = todayRange(now)
      return todayQuery.all(scope, Date.parse(start), Date.parse(end), limit).map(unpack).reverse()
    },
    addTurn(scope, requestId, messages) { transaction(() => append(scope, messages, requestId)) },
    turn(scope, requestId) {
      return database.prepare('SELECT payload FROM messages WHERE scope=? AND request_id=? ORDER BY seq').all(scope, requestId).map(unpack)
    },
    clear(scope) { database.prepare('DELETE FROM messages WHERE scope=?').run(scope) },
    forgetRadioText(text) { database.prepare("DELETE FROM messages WHERE scope=? AND instr(json_extract(payload, '$.text'), ?) > 0").run(radioScope, text) },
    hasRadioTrack(id) {
      return !!database.prepare("SELECT 1 FROM messages, json_each(messages.payload, '$.cards') AS card WHERE scope=? AND json_extract(card.value, '$.id')=? LIMIT 1").get(radioScope, id)
    },
    close() { database.close() },
  }
}
