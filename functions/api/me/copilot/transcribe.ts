import { endpoint, fail, limitedBody, object, reserve } from '../../../_music-copilot-state'

export const onRequestPost = endpoint(async (env, uid, request) => {
  if (!env.AI) return fail(503, 'SPEECH_UNAVAILABLE')
  const mime = (request.headers.get('Content-Type') ?? '').toLowerCase().split(';')[0]
  if (!['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/mpeg'].includes(mime))
    return fail(415, 'UNSUPPORTED_AUDIO')
  const bytes = await limitedBody(request, 1024 * 1024)
  if (bytes.length < 8) return fail(400, 'EMPTY_AUDIO')
  if (!(await reserve(env, uid, 'stt'))) return fail(429, 'SPEECH_LIMIT')
  let data = ''
  for (let offset = 0; offset < bytes.length; offset += 8192)
    data += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  const output = await env.AI.run(
    '@cf/openai/whisper-large-v3-turbo',
    { audio: btoa(data), task: 'transcribe', language: 'zh', vad_filter: true },
    { signal: AbortSignal.timeout(25000) },
  )
  if (!object(output) || typeof output.text !== 'string' || !output.text.trim())
    return fail(422, 'SPEECH_NOT_RECOGNIZED')
  return { text: output.text.trim().slice(0, 1600) }
})
