import type { Env } from '../../../_shared'

const releases = new Map([
  ['app', 'mosic-copilot-macos-arm64.zip'],
  ['source', 'mosic-copilot-source.zip'],
])
const releasePrefix = 'copilot-releases/v0.1.0/'

function rangeFor(header: string, size: number) {
  const value = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!value || !size || (!value[1] && !value[2])) return null
  const offset = value[1] ? Number(value[1]) : Math.max(0, size - Number(value[2]))
  const end = value[1] && value[2] ? Math.min(size - 1, Number(value[2])) : size - 1
  return Number.isSafeInteger(offset) && Number.isSafeInteger(end) && offset >= 0 && offset <= end
    ? { offset, length: end - offset + 1 }
    : null
}
function unavailable(status: number) {
  return new Response(null, { status, headers: { 'cache-control': 'no-store' } })
}

export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  const method = request.method
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' } })
  }
  const filename = releases.get(String(params.artifact))
  if (!filename) return unavailable(404)
  if (!env.MUSIC_MEDIA) return unavailable(503)
  const key = releasePrefix + filename
  try {
    const meta = await env.MUSIC_MEDIA.head(key)
    if (!meta) return unavailable(404)
    const modified = meta.uploaded.toUTCString()
    const headers = new Headers({
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-content-type-options': 'nosniff',
      etag: meta.httpEtag,
      'last-modified': modified,
      'cache-control': 'public, max-age=300',
      'accept-ranges': 'bytes',
    })
    const validators = request.headers
      .get('if-none-match')
      ?.split(',')
      .map((value) => value.trim().replace(/^W\//, ''))
    if (validators?.includes('*') || validators?.includes(meta.httpEtag))
      return new Response(null, { status: 304, headers })
    if (method === 'HEAD') {
      headers.set('content-length', String(meta.size))
      return new Response(null, { headers })
    }
    const rangeHeader = request.headers.get('range')
    const ifRange = request.headers.get('if-range')
    const useRange = rangeHeader && (!ifRange || ifRange === meta.httpEtag || ifRange === modified)
    const range = useRange ? rangeFor(rangeHeader, meta.size) : null
    if (useRange && !range) {
      headers.set('content-range', `bytes */${meta.size}`)
      return new Response(null, { status: 416, headers })
    }
    const object = await env.MUSIC_MEDIA.get(key, {
      onlyIf: { etagMatches: meta.etag },
      ...(range ? { range } : {}),
    })
    if (!object) return unavailable(404)
    if (!('body' in object)) return unavailable(503)
    headers.set('content-length', String(range?.length ?? meta.size))
    if (range)
      headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${meta.size}`)
    return new Response(object.body, { status: range ? 206 : 200, headers })
  } catch {
    return unavailable(503)
  }
}
