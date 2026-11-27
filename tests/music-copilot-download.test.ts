import { test, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { onRequest } from '../functions/api/music/copilot-download/[artifact]'

function setup(artifact = 'app', method = 'GET', headers: Record<string, string> = {}, exists = true) {
  const bytes = Uint8Array.of(80, 75, 3, 4, 1, 2)
  const metadata = {
    size: bytes.length,
    etag: 'release-sha',
    httpEtag: '"release-sha"',
    uploaded: new Date('2026-11-28T01:00:00Z'),
  }
  const head = vi.fn().mockResolvedValue(exists ? metadata : null)
  const get = vi.fn(async (_key: string, options: { range?: { offset: number; length: number } }) => {
    const range = options.range
    const result = range ? bytes.slice(range.offset, range.offset + range.length) : bytes
    return { ...metadata, body: new Response(result).body }
  })
  const context = {
    env: { MUSIC_MEDIA: { head, get } },
    params: { artifact },
    request: new Request('https://app.example/api/music/copilot-download/' + encodeURIComponent(artifact), {
      method,
      headers,
    }),
  }
  return { head, get, response: onRequest(context as never) as Promise<Response> }
}
test.each([
  ['app', 'mosic-copilot-macos-arm64.zip'],
  ['source', 'mosic-copilot-source.zip'],
])('streams only the fixed %s artifact with a filename and public validators', async (artifact, filename) => {
  const { response, head, get } = setup(artifact)
  const result = await response
  expect(head).toHaveBeenCalledWith('copilot-releases/v0.1.0/' + filename)
  expect(get).toHaveBeenCalledTimes(1)
  expect(result.status).toBe(200)
  expect(result.headers.get('content-disposition')).toContain(filename)
  expect(result.headers.get('etag')).toBe('"release-sha"')
  expect(result.headers.get('content-length')).toBe('6')
  expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([80, 75, 3, 4, 1, 2])
})
test('HEAD and conditional retrieval avoid reading archive contents', async () => {
  const head = setup('source', 'HEAD')
  expect((await head.response).headers.get('content-length')).toBe('6')
  expect(await (await head.response).text()).toBe('')
  expect(head.get).not.toHaveBeenCalled()
  const cached = setup('app', 'GET', { 'If-None-Match': '"earlier", W/"release-sha"' })
  expect((await cached.response).status).toBe(304)
  expect(cached.get).not.toHaveBeenCalled()
})
test('resumable downloads report the actual range; a changed validator returns the full release', async () => {
  const resumed = setup('app', 'GET', { Range: 'bytes=2-4', 'If-Range': '"release-sha"' })
  const response = await resumed.response
  expect(response.status).toBe(206)
  expect(response.headers.get('content-range')).toBe('bytes 2-4/6')
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([3, 4, 1])
  expect((await setup('app', 'GET', { Range: 'bytes=-2' }).response).headers.get('content-range')).toBe(
    'bytes 4-5/6',
  )
  expect((await setup('app', 'GET', { Range: 'bytes=2-4', 'If-Range': '"outdated"' }).response).status).toBe(200)
  const invalid = setup('app', 'GET', { Range: 'bytes=256-' })
  expect((await invalid.response).status).toBe(416)
  expect(invalid.get).not.toHaveBeenCalled()
})
test('unknown artifacts, inaccessible buckets and unknown methods never read arbitrary keys or cache errors', async () => {
  for (const path of ['../../moment-photos/private', '__proto__', 'constructor', 'x.zip']) {
    const x = setup(path)
    expect((await x.response).status).toBe(404)
    expect(x.head).not.toHaveBeenCalled()
  }
  const write = setup('app', 'POST')
  expect((await write.response).status).toBe(405)
  expect(write.head).not.toHaveBeenCalled()
  const absent = setup('app', 'GET', {}, false)
  expect((await absent.response).status).toBe(404)
  expect((await absent.response).headers.get('cache-control')).toBe('no-store')
  expect(
    (
      await onRequest({
        env: {},
        params: { artifact: 'app' },
        request: new Request('https://app.example'),
      } as never)
    ).status,
  ).toBe(503)
})
test('the public download page links both fixed endpoints and the cockpit', () => {
  const html = readFileSync(new URL('../public/desktop/index.html', import.meta.url), 'utf8')
  for (const href of ['/api/music/copilot-download/app', '/api/music/copilot-download/source', '/'])
    expect(html).toContain('href="' + href + '"')
})
