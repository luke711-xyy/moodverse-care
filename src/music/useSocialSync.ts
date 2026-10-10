import { useCallback, useEffect, useRef, useState } from 'react'
import { MusicApiError, type MusicApi, type MusicSocialSnapshot } from '../music-api'

export function useSocialSync(api: MusicApi, enabled: boolean, accountEpoch: number) {
  const [snapshot, setSnapshot] = useState<MusicSocialSnapshot | null>(null)
  const [notice, setNotice] = useState('')
  const [connection, setConnection] = useState<'connecting' | 'live' | 'reconnecting' | 'offline'>('connecting')
  const refreshRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    setSnapshot(null); setNotice('')
    if (!enabled) return
    let stopped = false, generation = 0
    let previous: MusicSocialSnapshot | null = null
    let unsubscribe: (() => void) | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let pending: AbortController | null = null
    const apply = (received: MusicSocialSnapshot) => {
      const friends = new Set(received.friends.map(friend => friend.userId))
      const next = { ...received,
        incoming: received.incoming.filter(request => !friends.has(request.userId)),
        outgoing: received.outgoing.filter(request => !friends.has(request.userId)),
      }
      const incoming = next.incoming.filter(r => !previous?.incoming.some(old => old.id === r.id))
      const added = previous ? next.friends.filter(f => !previous!.friends.some(old => old.userId === f.userId)) : []
      const rejected = previous ? next.outgoing.filter(r => r.status === 'rejected' && previous!.outgoing.some(old => old.id === r.id && old.status === 'pending')) : []
      if (incoming.length) setNotice(incoming.length === 1 ? `「${incoming[0].displayName}」发来了好友请求。` : `收到 ${incoming.length} 条新的好友请求。`)
      else if (added.length) setNotice(`你与「${added[0].displayName}」已成为好友。`)
      else if (rejected.length) setNotice(`「${rejected[0].displayName}」暂未接受你的好友请求。`)
      previous = next; setSnapshot(next)
    }
    const schedule = () => {
      if (!stopped && !retry && api.liveSocial && navigator.onLine !== false && document.visibilityState !== 'hidden') {
        retry = setTimeout(() => { retry = undefined; void refresh() }, 5000)
      }
    }
    const refresh = async () => {
      const token = ++generation
      unsubscribe?.(); unsubscribe = null
      clearTimeout(retry); retry = undefined
      pending?.abort(); pending = null
      if (stopped) return
      if (navigator.onLine === false) { setConnection('offline'); return }
      if (document.visibilityState === 'hidden') return
      const controller = new AbortController(); pending = controller
      const timeout = setTimeout(() => controller.abort(), 10000)
      let authenticated = true
      try {
        const next = await api.loadSocialState(controller.signal)
        if (stopped || token !== generation) return
        apply(next)
      } catch (error) {
        if (stopped || token !== generation) return
        if (error instanceof MusicApiError && error.status === 401) {
          authenticated = false; previous = null; setSnapshot(null); setNotice('')
        }
        setConnection('reconnecting')
      } finally { clearTimeout(timeout) }
      if (stopped || token !== generation || !authenticated) return
      if (!api.liveSocial) { setConnection('live'); return }
      try {
        unsubscribe = api.subscribeSocialState(next => {
          if (stopped || token !== generation) return
          clearTimeout(retry); retry = undefined; setConnection('live'); apply(next)
        }, connected => {
          if (stopped || token !== generation) return
          setConnection(connected ? 'live' : 'reconnecting')
          if (connected) { clearTimeout(retry); retry = undefined }
          else schedule()
        })
      } catch { setConnection('reconnecting') }
      schedule() // Also covers unavailable EventSource and connections that never open.
    }
    const resume = () => { if (document.visibilityState !== 'hidden') void refresh() }
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        generation++; unsubscribe?.(); unsubscribe = null; pending?.abort(); clearTimeout(retry); retry = undefined
      } else void refresh()
    }
    const offline = () => {
      generation++; unsubscribe?.(); unsubscribe = null; pending?.abort(); clearTimeout(retry); retry = undefined; setConnection('offline')
    }
    refreshRef.current = refresh
    void refresh()
    window.addEventListener('focus', resume); window.addEventListener('online', resume); window.addEventListener('offline', offline)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      stopped = true; generation++; unsubscribe?.(); pending?.abort(); clearTimeout(retry)
      refreshRef.current = async () => {}
      window.removeEventListener('focus', resume); window.removeEventListener('online', resume); window.removeEventListener('offline', offline)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [api, enabled, accountEpoch])

  const refresh = useCallback(() => refreshRef.current(), [])
  return { snapshot, notice, connection, refresh, dismiss: () => setNotice('') }
}
