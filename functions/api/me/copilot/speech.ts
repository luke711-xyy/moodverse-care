import { endpoint, fail, bodyJson, string, reserve } from '../../../_music-copilot-state'

const escapeXml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
export const onRequestPost = endpoint(async (env, uid, request) => {
  const region = env.AZURE_SPEECH_REGION ?? '',
    key = env.AZURE_SPEECH_KEY,
    voice = env.AZURE_SPEECH_VOICE ?? 'zh-CN-XiaoxiaoNeural'
  if (!key || !/^[a-z0-9]{2,30}$/.test(region) || !/^[a-zA-Z0-9-]{2,96}$/.test(voice))
    return fail(503, 'SPEECH_UNAVAILABLE')
  const text = string((await bodyJson(request)).text, 1000)
  if (!text) return fail(400, 'INVALID_SPEECH_TEXT')
  if (!(await reserve(env, uid, 'tts'))) return fail(429, 'SPEECH_LIMIT')
  const response = await fetch('https://' + region + '.tts.speech.microsoft.com/cognitiveservices/v1', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
    headers: {
      'content-type': 'application/ssml+xml',
      'Ocp-Apim-Subscription-Key': key,
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'MOSIC',
    },
    body: '<speak version="1.0" xml:lang="zh-CN"><voice name="' + voice + '">' + escapeXml(text) + '</voice></speak>',
  })
  if (!response.ok || !response.body) return fail(503, 'SPEECH_UNAVAILABLE')
  return new Response(response.body, { headers: { 'Content-Type': 'audio/mpeg', 'X-Content-Type-Options': 'nosniff' } })
})
