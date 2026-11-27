import processorUrl from './dictation-processor.js?url&no-inline'

type LocalRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  processLocally: boolean
  onstart: (() => void) | null
  onend: (() => void) | null
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionConstructor = {
  new (): LocalRecognition
  available?(options: { langs: string[]; processLocally: boolean }): Promise<string>
}
type DictationOptions = {
  signal: AbortSignal
  ready(stop: () => void): void
  transcript(text: string): void
  complete(message?: string): void
}

function wav(samples: Int16Array[], length: number) {
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const label = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  label(0, 'RIFF')
  view.setUint32(4, length * 2 + 36, true)
  label(8, 'WAVE')
  label(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true)
  view.setUint32(28, 32000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  label(36, 'data')
  view.setUint32(40, length * 2, true)
  return new Blob([header, ...samples.map((chunk) => chunk.buffer as ArrayBuffer)], { type: 'audio/wav' })
}

function localDictation(rec: LocalRecognition, options: DictationOptions) {
  const { signal, ready, transcript, complete } = options
  let heard = false
  rec.lang = 'zh-CN'
  rec.processLocally = true
  rec.continuous = rec.interimResults = true
  const abort = () => {
    rec.onstart = rec.onend = rec.onerror = rec.onresult = null
    rec.abort()
  }
  signal.addEventListener('abort', abort, { once: true })
  rec.onresult = (event) => {
    const text = Array.from(event.results, (result) => result[0]?.transcript || '')
      .join('')
      .trim()
    heard ||= Boolean(text)
    transcript(text)
  }
  rec.onstart = () => ready(() => rec.stop())
  rec.onend = () => complete(heard ? undefined : '没有听清，请再按住说话。')
  rec.onerror = (event) =>
    complete(
      event.error === 'not-allowed'
        ? '麦克风权限未开启，可以输入文字。'
        : '设备听写中断，已识别的文字仍可编辑。',
    )
  rec.start()
}

export async function startWebDictation(options: DictationOptions) {
  const { signal, ready, transcript, complete } = options
  const win = window as Window & {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  const Engine = win.SpeechRecognition ?? win.webkitSpeechRecognition
  if (Engine?.available) {
    const local = await Engine.available({ langs: ['zh-CN'], processLocally: true }).catch(() => '')
    if (signal.aborted) return
    if (local === 'available') {
      localDictation(new Engine(), options)
      return
    }
  }
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('此浏览器没有可用麦克风，可以输入文字。')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } })
  let tracksStopped = false
  const stopTracks = () => {
    if (tracksStopped) return
    tracksStopped = true
    stream.getTracks().forEach((track) => track.stop())
  }
  if (signal.aborted) {
    stopTracks()
    return
  }

  let context: AudioContext | undefined
  let node: AudioWorkletNode | undefined
  let closing = false
  const chunks: Int16Array[] = []
  let total = 0,
    lastPreview = 0
  let preview: AbortController | undefined
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  const closeAudio = () => {
    stopTracks()
    if (node) {
      node.port.onmessage = null
      node.disconnect()
      node = undefined
    }
    if (context && context.state !== 'closed') void context.close().catch(() => {})
    context = undefined
    clearTimeout(flushTimer)
  }
  signal.addEventListener(
    'abort',
    () => {
      preview?.abort()
      closeAudio()
    },
    { once: true },
  )

  // Each preview contains a complete, bounded WAV. Whisper can revise earlier
  // words instead of splicing syllables at arbitrary audio segment boundaries.
  const recognize = async (requestSignal: AbortSignal, final: boolean) => {
    const response = await fetch('/api/me/copilot/transcribe', {
      method: 'POST',
      credentials: 'same-origin',
      body: wav(chunks, total),
      signal: requestSignal,
    })
    if (requestSignal.aborted || signal.aborted || (!final && closing)) return
    if (response.status === 422 && !final) return
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? '今日在线听写额度已用完，草稿仍可编辑。'
          : response.status === 422
            ? '没有听清，草稿仍可编辑。'
            : '在线转写中断，草稿仍可编辑。',
      )
    const result = (await response.json()) as { text?: string }
    if (!signal.aborted && !requestSignal.aborted && (final || !closing) && result.text?.trim())
      transcript(result.text.trim())
  }
  let finalizing = false
  const finish = async () => {
    if (finalizing || signal.aborted) return
    finalizing = true
    closeAudio()
    if (!total) {
      complete('没有录到声音，请再按住说话。')
      return
    }
    try {
      await recognize(signal, true)
      if (!signal.aborted) complete()
    } catch (error) {
      if (!signal.aborted) complete(error instanceof Error ? error.message : '在线转写失败。')
    }
  }

  try {
    context = new AudioContext()
    await Promise.all([context.audioWorklet.addModule(processorUrl), context.resume()])
    if (signal.aborted) return
    node = new AudioWorkletNode(context, 'mosic-dictation', { channelCount: 1, channelCountMode: 'explicit' })
    const input = context.createMediaStreamSource(stream)
    node.port.onmessage = ({ data }: MessageEvent<Int16Array | 'finished'>) => {
      if (signal.aborted) return
      if (data === 'finished') {
        if (closing) void finish()
        return
      }
      if (!data.length || total + data.length > 16_000 * 31) return
      chunks.push(data)
      total += data.length
      // Return the first words quickly; throttle later revisions and allow only one request in flight.
      const interval = lastPreview === 0 ? 16000 * 1.3 : 16000 * 4
      if (closing || preview || total - lastPreview < interval) return
      lastPreview = total
      const request = new AbortController()
      preview = request
      void recognize(request.signal, false)
        .catch((error) => {
          if (
            !request.signal.aborted &&
            !signal.aborted &&
            !closing &&
            error instanceof Error &&
            error.message.includes('额度')
          )
            complete(error.message)
        })
        .finally(() => {
          if (preview === request) preview = undefined
        })
    }
    node.onprocessorerror = () => complete('浏览器收音中断，草稿仍可编辑。')
    input.connect(node)
    node.connect(context.destination)
    ready(() => {
      closing = true
      stopTracks()
      preview?.abort()
      node?.port.postMessage('finish')
      flushTimer = setTimeout(() => void finish(), 160)
    })
  } catch (error) {
    closeAudio()
    throw error
  }
}
