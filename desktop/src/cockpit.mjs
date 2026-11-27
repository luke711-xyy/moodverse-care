// The renderer can choose a bounded message and its visible context. Endpoint,
// credentials, inference instruction and network destinations stay in main.
import { chat } from './providers.mjs'
import { generateCockpitReply } from './cockpit-conversation.mjs'
export { filtersFor, cockpitCandidates } from './cockpit-conversation.mjs'
import { site } from './universe.mjs'

export function cockpitOrigin(packaged, preview) {
  if (packaged || !preview) return site
  const url = new URL(preview)
  if (!['127.0.0.1','[::1]','localhost'].includes(url.hostname) || url.protocol !== 'http:' ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('开发预览必须是本机 HTTP 服务。')
  return url.origin
}
export function safeCockpitPage(raw, origin) {
  try { const url=new URL(raw)
    return url.origin===origin && !url.username && !url.password && ['/', '/index.html'].includes(url.pathname)
  } catch { return false }
}

export function cockpitReply(options) {
  return generateCockpitReply({generate:chat,...options})
}

export function classifyCockpitLink(raw, origin) {
  try {
    const url = new URL(raw)
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) return 'blocked'
    if (safeCockpitPage(raw,origin)) return 'cockpit'
    if(url.origin===origin && (/^\/api\/me\/messages\/[^/]+\/photo$/.test(url.pathname) ||
        /^\/api\/music\/moment-photos\/[^/]+$/.test(url.pathname))) return 'photo'
    return 'external'
  } catch { return 'blocked' }
}
