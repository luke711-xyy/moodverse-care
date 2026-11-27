import { endpoint, fail, historyPage, messagesFor } from '../../../_music-copilot-state'
import { refreshMessages } from '../../../_music-copilot-facts'

function readDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))
    return fail(400, 'INVALID_HISTORY_RANGE')
  const date = Date.parse(value)
  const canonical = value.includes('.') ? value : value.slice(0, -1) + '.000Z'
  if (!Number.isFinite(date) || new Date(date).toISOString() !== canonical)
    return fail(400, 'INVALID_HISTORY_RANGE')
  return date
}

export const onRequestGet = endpoint(async (env, uid, request) => {
  const params = new URL(request.url).searchParams
  if (params.get('owner') === '1') return { ownerId: uid }
  const start = readDate(params.get('start')), end = readDate(params.get('end'))
  // A leap year can include an additional hour when a time zone changes offset.
  if (end <= start || end - start > 367 * 86400000) return fail(400, 'INVALID_HISTORY_RANGE')
  const range = { start: new Date(start).toISOString(), end: new Date(end).toISOString() }
  const page = await historyPage(env, uid, range, params.get('cursor'))
  return { messages: await refreshMessages(env, uid, page.rows.flatMap(messagesFor)), nextCursor: page.nextCursor }
})
