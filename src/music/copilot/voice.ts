import { useCallback, useEffect, useRef, useState } from 'react'
import type { DesktopBridge } from './desktop-bridge'
import { startWebDictation } from './web-dictation'

type VoicePhase = 'idle' | 'permission' | 'recording' | 'transcribing'
type VoiceOptions = {
  onTranscript(text: string): void
  onDuckChange(ducked: boolean): void
  onError(message: string): void
  desktopVoice?: DesktopBridge | null
}
type Session = { controller: AbortController; finish?: () => void; timer?: ReturnType<typeof setTimeout> }

export function useCopilotVoice(options: VoiceOptions) {
  const latest = useRef(options)
  latest.current = options
  const session = useRef<Session | null>(null)
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const transition = useCallback((next: VoicePhase) => {
    setPhase(next)
    latest.current.onDuckChange(next === 'recording')
  }, [])
  const cancel = useCallback(() => {
    const current = session.current
    session.current = null
    if (current) {
      clearTimeout(current.timer)
      current.controller.abort()
    }
    transition('idle')
  }, [transition])
  const end = useCallback(() => {
    const current = session.current
    if (!current) return
    if (!current.finish) {
      cancel()
      return
    }
    clearTimeout(current.timer)
    transition('transcribing')
    current.timer = setTimeout(() => {
      cancel()
      latest.current.onError('听写超时，已识别的文字仍可编辑。')
    }, 28000)
    current.finish()
  }, [cancel, transition])

  const begin = useCallback(() => {
    if (session.current) return
    const current: Session = { controller: new AbortController() }
    session.current = current
    const { signal } = current.controller
    const complete = (error?: string) => {
      if (session.current !== current) return
      cancel()
      if (error) latest.current.onError(error)
    }
    const ready = (stop: () => void) => {
      if (signal.aborted || current.finish) return
      let released = false
      current.finish = () => {
        if (!released) {
          released = true
          stop()
        }
      }
      transition('recording')
      current.timer = setTimeout(end, 30000)
    }
    const transcript = (text: string) => {
      if (!signal.aborted) latest.current.onTranscript(text)
    }
    transition('permission')
    const native = latest.current.desktopVoice
    if (native === undefined) {
      void startWebDictation({ signal, ready, transcript, complete }).catch((error) =>
        complete(
          error?.name === 'NotAllowedError'
            ? '麦克风权限未开启，可以输入文字。'
            : '无法开始听写，请检查麦克风或直接输入。',
        ),
      )
      return
    }
    if (!native?.onVoice || !native.voiceStart || !native.voiceFinish || !native.voiceCancel) {
      complete('桌面本机语音尚未就绪，可以输入文字。')
      return
    }
    let finished = false
    const unsubscribe = native.onVoice((event) => {
      if (signal.aborted) return
      if (event.type === 'ready') {
        ready(() => void native.voiceFinish!().catch(() => complete('本机转写未完成。')))
        return
      }
      if (event.type === 'partial') {
        if (typeof event.text === 'string') transcript(event.text)
        return
      }
      finished = true
      if (event.type === 'text' && event.text?.trim()) transcript(event.text.trim())
      complete(event.type === 'error' ? event.message || '请检查 Mac 的麦克风与语音识别权限。' : undefined)
    })
    signal.addEventListener(
      'abort',
      () => {
        unsubscribe()
        if (!finished) void native.voiceCancel!().catch(() => {})
      },
      { once: true },
    )
    // Native permission is only available inside the original trusted hold gesture.
    void native.voiceStart().catch(() => complete('Mac 未能开始听写，可以输入文字。'))
  }, [cancel, end, transition])

  useEffect(() => {
    const hidden = () => {
      if (document.hidden) cancel()
    }
    const escape = (event: KeyboardEvent) => {
      if (session.current && event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        cancel()
      }
    }
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', cancel)
    window.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', cancel)
      window.removeEventListener('keydown', escape, true)
      cancel()
    }
  }, [cancel])
  return { phase, begin, end, cancel }
}
