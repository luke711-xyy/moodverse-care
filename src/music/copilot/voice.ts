import type { DesktopBridge } from './desktop-bridge'
import { useCallback, useEffect, useRef, useState } from 'react'

export type CopilotIntercomHandle = { begin(): void; end(): void; cancel(): void; toggle(): void }
type VoicePhase = 'idle' | 'permission' | 'recording' | 'transcribing' | 'synthesizing' | 'speaking'
type VoiceOptions = {
  onTranscript(text: string): void
  onDuckChange(ducked: boolean): void
  onError(message: string): void
  serverSpeech: boolean
  desktopVoice?: DesktopBridge | null
  desktopEnabled?: boolean
}
const maxRecordingMs = 30_000
const transcribeUrl = '/api/me/copilot/transcribe'

/** One owner for the live mic, the voice request and the current utterance.
 * Invalidating the owner also handles permission prompts resolving after cancel. */
export function useCopilotVoice(options: VoiceOptions) {
  const latest = useRef(options)
  latest.current = options
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const currentPhase = useRef<VoicePhase>('idle')
  const owner = useRef(0)
  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const request = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const playback = useRef<HTMLAudioElement | null>(null)
  const blobUrl = useRef('')
  const utterance = useRef<SpeechSynthesisUtterance | null>(null)

  const transition = useCallback((value: VoicePhase) => {
    currentPhase.current = value
    setPhase(value)
    latest.current.onDuckChange(value === 'recording' || value === 'speaking')
  }, [])

  const nativeVoice = useRef<{ bridge: DesktopBridge; unsubscribe: () => void } | null>(null)
  const releaseNative = useCallback((abort: boolean) => {
    const handle = nativeVoice.current
    nativeVoice.current = null
    handle?.unsubscribe()
    if (abort) void handle?.bridge.voiceCancel?.().catch(() => {})
  }, [])
  const releaseMic = useCallback(() => {
    clearTimeout(timer.current)
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    recorder.current = null
  }, [])

  const cancel = useCallback(() => {
    ++owner.current
    releaseNative(true)
    request.current?.abort()
    request.current = null
    if (recorder.current?.state === 'recording') recorder.current.stop()
    releaseMic()
    if (playback.current) {
      playback.current.onended = playback.current.onerror = null
      playback.current.pause()
      playback.current = null
    }
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current)
    blobUrl.current = ''
    if (utterance.current) {
      utterance.current.onend = utterance.current.onerror = null
      utterance.current = null
      window.speechSynthesis?.cancel()
    }
    transition('idle')
  }, [releaseMic, releaseNative, transition])

  const end = useCallback(() => {
    if (currentPhase.current === 'permission') {
      cancel()
      return
    }
    if (nativeVoice.current) {
      if (currentPhase.current !== 'recording') return
      transition('transcribing')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        cancel()
        latest.current.onError('本机转写超时，请再试一次。')
      }, 15000)
      const ticket = owner.current
      void nativeVoice.current.bridge.voiceFinish?.().catch(() => {
        if (owner.current === ticket) {
          cancel()
          latest.current.onError('本机转写未完成。')
        }
      })
      return
    }
    if (recorder.current?.state === 'recording') {
      clearTimeout(timer.current)
      recorder.current.stop()
    }
  }, [cancel, transition])

  const begin = useCallback(async () => {
    if (currentPhase.current === 'recording' || currentPhase.current === 'permission') return
    cancel()
    if (latest.current.desktopVoice !== undefined) {
      const native = latest.current.desktopVoice
      if (
        !latest.current.desktopEnabled ||
        !native?.voiceStart ||
        !native.onVoice ||
        !native.voiceFinish ||
        !native.voiceCancel
      ) {
        latest.current.onError('桌面本机语音尚未就绪，可以输入文字。')
        return
      }
      const ticket = owner.current
      transition('permission')
      const unsubscribe = native.onVoice((event) => {
        if (ticket !== owner.current) return
        if (event.type === 'ready') {
          transition('recording')
          timer.current = setTimeout(end, maxRecordingMs)
        } else {
          clearTimeout(timer.current)
          releaseNative(false)
          transition('idle')
          if (event.type === 'text' && event.text?.trim()) latest.current.onTranscript(event.text.trim())
          if (event.type === 'error')
            latest.current.onError(event.message || '请检查 Mac 的麦克风与语音识别权限。')
        }
      })
      nativeVoice.current = { bridge: native, unsubscribe }
      try {
        await native.voiceStart()
      } catch {
        if (ticket === owner.current) {
          cancel()
          latest.current.onError('Mac 未能开始听写，可以输入文字。')
        }
      }
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      latest.current.onError('此浏览器无法使用麦克风，可以直接输入消息。')
      return
    }
    const ticket = owner.current
    transition('permission')
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (ticket !== owner.current) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = media
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((type) =>
        MediaRecorder.isTypeSupported?.(type),
      )
      const mic = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
      recorder.current = mic
      const chunks: Blob[] = []
      mic.ondataavailable = (event) => {
        if (ticket === owner.current && event.data.size) chunks.push(event.data)
      }
      mic.onerror = () => {
        if (ticket !== owner.current) return
        cancel()
        latest.current.onError('录音中断，请重试或输入文字。')
      }
      mic.onstop = async () => {
        if (ticket !== owner.current) return
        releaseMic()
        const audio = new Blob(chunks, { type: (mic.mimeType || chunks[0]?.type || 'audio/webm').split(';')[0] })
        if (!audio.size) {
          transition('idle')
          latest.current.onError('没有录到声音，请再试一次。')
          return
        }
        transition('transcribing')
        const controller = new AbortController()
        request.current = controller
        try {
          const response = await fetch(transcribeUrl, {
            method: 'POST',
            credentials: 'same-origin',
            body: audio,
            signal: controller.signal,
          })
          if (!response.ok)
            throw new Error(
              response.status === 503 ? '语音转写暂未连接，可以输入消息。' : '未能转写录音，请重试或输入文字。',
            )
          const result = (await response.json()) as { text?: string }
          if (!result.text?.trim()) throw new Error('没有听清，请再说一次。')
          if (ticket === owner.current) latest.current.onTranscript(result.text.trim())
        } catch (error) {
          if (ticket === owner.current)
            latest.current.onError(error instanceof Error ? error.message : '转写失败，请重试。')
        } finally {
          if (ticket === owner.current) {
            request.current = null
            transition('idle')
          }
        }
      }
      mic.start()
      transition('recording')
      timer.current = setTimeout(end, maxRecordingMs)
    } catch (error) {
      if (ticket !== owner.current) return
      cancel()
      latest.current.onError(
        (error as DOMException)?.name === 'NotAllowedError'
          ? '麦克风权限未开启，可以输入消息。'
          : '无法打开麦克风，请检查输入设备。',
      )
    }
  }, [cancel, end, releaseMic, releaseNative, transition])

  const toggle = useCallback(() => {
    if (currentPhase.current === 'recording' || currentPhase.current === 'permission') end()
    else void begin()
  }, [begin, end])

  const speak = useCallback(
    async (text: string) => {
      cancel()
      const ticket = owner.current
      transition('synthesizing')
      if (latest.current.serverSpeech) {
        const controller = new AbortController()
        request.current = controller
        try {
          const response = await fetch('/api/me/copilot/speech', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
            signal: controller.signal,
          })
          if (!response.ok) throw new Error()
          const audio = await response.blob()
          if (ticket !== owner.current) return
          blobUrl.current = URL.createObjectURL(audio)
          const player = new Audio(blobUrl.current)
          playback.current = player
          player.onended = () => {
            if (ticket === owner.current) cancel()
          }
          player.onerror = () => {
            if (ticket === owner.current) {
              cancel()
              latest.current.onError('语音未能播放，回复已保留。')
            }
          }
          await player.play()
          if (ticket === owner.current) transition('speaking')
          return
        } catch {
          if (ticket !== owner.current) return
          if (playback.current) {
            playback.current.onerror = playback.current.onended = null
            playback.current.pause()
            playback.current = null
          }
          if (blobUrl.current) URL.revokeObjectURL(blobUrl.current)
          blobUrl.current = ''
        } finally {
          if (ticket === owner.current) request.current = null
        }
      }
      if (typeof SpeechSynthesisUtterance === 'undefined' || !window.speechSynthesis) {
        cancel()
        latest.current.onError('此设备暂时无法播报，可以阅读副驾回复。')
        return
      }
      const speech = new SpeechSynthesisUtterance(text)
      speech.lang = 'zh-CN'
      const chinese = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.localService && /^(zh|cmn)(?:[-_]|$)/i.test(voice.lang))
      if (!chinese) {
        cancel()
        latest.current.onError('没有可用的中文声音。可在系统语音设置中添加中文声线，或直接阅读回复。')
        return
      }
      speech.voice = chinese
      utterance.current = speech
      speech.onstart = () => {
        if (ticket === owner.current) transition('speaking')
      }
      speech.onend = () => {
        if (ticket === owner.current) cancel()
      }
      speech.onerror = () => {
        if (ticket === owner.current) {
          cancel()
          latest.current.onError('设备播报中断，文字回复仍可查看。')
        }
      }
      try {
        window.speechSynthesis.speak(speech)
      } catch {
        cancel()
        latest.current.onError('设备语音暂不可用。')
      }
    },
    [cancel, transition],
  )

  useEffect(() => {
    // Some engines populate their voice list asynchronously after its first read.
    window.speechSynthesis?.getVoices()
    const onHidden = () => {
      if (document.visibilityState === 'hidden') cancel()
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && currentPhase.current !== 'idle') {
        event.preventDefault()
        event.stopImmediatePropagation()
        cancel()
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', cancel)
    window.addEventListener('keydown', onEscape, true)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', cancel)
      window.removeEventListener('keydown', onEscape, true)
      cancel()
    }
  }, [cancel])

  return { phase, begin, end, cancel, toggle, speak }
}
