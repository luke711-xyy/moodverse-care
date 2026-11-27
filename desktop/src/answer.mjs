export function parseAnswer(raw,candidates,userText) {
  const clean=raw.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/gi,'')
  let data
  try { data=JSON.parse(clean) } catch { /* Some local models answer in prose. */ }
  if (!data || typeof data!=='object' || Array.isArray(data)) {
    const marker=/^\s*[-*]?\s*["'`*]*playId["'`*]*\s*[:：=]\s*["'`*]*([\w:-]+)["'`*]*[,.。]?\s*$/im
    const playId=clean.match(marker)?.[1]
    const reply=clean.replace(marker,'').trim()
    const words=reply.normalize('NFKC').toLowerCase()
    // Exact titles may identify a track when a model omits IDs. A duplicated
    // title cannot identify which version the listener was offered.
    const titles=candidates.map(t=>t.title?.normalize('NFKC').trim().toLowerCase()||'')
    const matches=candidates.filter((_,i)=>{
      const title=titles[i]
      if(title.length<2 || titles.indexOf(title)!==titles.lastIndexOf(title))return false
      const escaped=title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
      return new RegExp('(?<![a-z0-9])'+escaped+'(?![a-z0-9])','u').test(words)
    })
    data={reply,playId,trackIds:matches.map(t=>t.id)}
  }
  const ids=new Set([...(Array.isArray(data.trackIds)?data.trackIds:[]),data.playId])
  const cards=[...ids].flatMap(id=>candidates.filter(t=>t.id===id)).slice(0,3)
  const requested = /播放|放一首|给我放|直接播|播第|来一首|听第|请播|play\b/i.test(userText)
  const declined = /(?:别|不(?:要|用|必)?|先不|暂不|停止).{0,5}(?:播|放|听)|仅推荐|只(?:要)?推荐|(?:don't|do not|never)\s+play/i.test(userText)
  const nominated = cards.find(t=>t.id===data.playId)
  const playId = requested && !declined ? (nominated?.id ?? (!data.playId && cards.length===1 ? cards[0].id : null)) : null
  return {text:String(data.reply || '').slice(0,2400)||(cards.length?'可以从这些结果开始。':'暂时没有找到合适的结果。'),cards,playId}
}
