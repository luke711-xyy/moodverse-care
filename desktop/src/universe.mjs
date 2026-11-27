export const site = 'https://moodverse-care.pages.dev'
const musicPath = '/api/music/'
const safeId = id => typeof id === 'string' && /^[\w:-]{1,128}$/.test(id)
export async function request(path, options = {}, fetcher = fetch) {
  const response = await fetcher(new URL(path, site), { redirect: 'error', signal: AbortSignal.timeout(25000), ...options })
  if (!response.ok) throw new Error(`MOSIC 请求失败（${response.status}）`)
  return response.json()
}
export async function catalogue(query = '', fetcher = fetch) {
  const q = String(query).trim().slice(0, 120)
  const data = await request(musicPath + 'catalog?' + new URLSearchParams({ q }), {}, fetcher)
  return { source: data.status, at: Date.now(), tracks: (data.tracks || []).filter(t => safeId(t.id) &&
    (t.audioUrl === '/api/music/tracks/' + encodeURIComponent(t.id) + '/stream' || t.audioUrl?.startsWith('/audio/') && /^\/audio\/[\w.%/-]+$/.test(t.audioUrl) && !t.audioUrl.includes('..')))
    .slice(0, 50).map(t => ({ id:t.id, title:t.title, artist:t.artistName, genres:t.genres || [], moods:t.moodTags || [],
      bpm:t.visualFeatures?.tempoBpm || null, url:new URL(t.audioUrl,site).href })) }
}
export async function device(action, data, token, fetcher = fetch) {
  return request(musicPath + 'copilot-device', {method:'POST',headers:{
    'Content-Type':'application/json', ...(token ? {Authorization:'Bearer ' + token} : {}),
  },body:JSON.stringify({action,...data})}, fetcher)
}
export async function matchingPlanets(trackId, token, fetcher = fetch) {
  if (!safeId(trackId) || !token) throw new Error('请先配对桌面副驾并选择一首歌。')
  return (await device('match',{trackId},token,fetcher)).planets
}
