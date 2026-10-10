import { useEffect, useRef } from 'react'
import { musicDayKey, nextMusicDayAt } from './daily-selection'

export function useDailyRollover(enabled: boolean, onRollover: () => void) {
  const callback = useRef(onRollover)
  callback.current = onRollover
  useEffect(() => {
    if (!enabled) return
    let day = musicDayKey()
    let timer: ReturnType<typeof setTimeout>
    const check = () => {
      clearTimeout(timer)
      if (document.visibilityState !== 'hidden') {
        const current = musicDayKey()
        if (current !== day) { day = current; callback.current() }
      }
      timer = setTimeout(check, Math.max(1, nextMusicDayAt() - Date.now()))
    }
    check()
    window.addEventListener('focus', check)
    window.addEventListener('online', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', check)
      window.removeEventListener('online', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [enabled])
}
