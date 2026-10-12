import { safeHttpsUrl, type Env } from './_shared'
import { audiusGet } from './_music-audius'
import { genreArtwork } from '../src/music/genre-artwork'
import type { GalaxyGroupBy, GalaxyStarArtwork } from '../src/music-api'

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const image = (value: unknown) => {
  if (!isRecord(value)) return null
  for (const size of ['480x480','1000x1000','150x150']) {
    const candidate=value[size]
    if(typeof candidate === 'string' && candidate.length<=4096) { const url=safeHttpsUrl(candidate);if(url)return url }
  }
  return null
}
const cache = new Map<string,{expires:number;artwork:GalaxyStarArtwork}>()
const pending = new Map<string,Promise<GalaxyStarArtwork | undefined>>()
const providerId = (key:string) => /^audius:[a-zA-Z0-9]{1,64}$/.test(key) ? key.slice(7) : null
const label = (value:unknown, fallback:string) => typeof value==='string' && value.trim() ? value.trim().slice(0,300) : fallback

async function providerArtwork(env:Env, by:'song'|'artist', id:string):Promise<GalaxyStarArtwork | undefined> {
  if(by==='song') {
    const response=await audiusGet(env,`/tracks/${id}`)
    const track=response.data
    if(!isRecord(track) || track.id!==id || track.is_delete || track.is_unlisted || track.is_available===false) return
    const album=isRecord(track.album_backlink)?track.album_backlink.playlist_id:null
    if((typeof album==='string' && /^[a-zA-Z0-9]{1,64}$/.test(album)) || (typeof album==='number' && Number.isSafeInteger(album) && album>0)) {
      try {
        const response=await audiusGet(env,`/playlists/${album}`)
        const collection=Array.isArray(response.data)?response.data[0]:response.data
        const matches=isRecord(collection) && (typeof album==='number' ? collection.playlist_id===album : collection.id===album)
        const url=matches && collection.is_album===true && !collection.is_delete && !collection.is_private ? image(collection.artwork) : null
        if(url) return {url,source:'song-cover',label:label(collection.playlist_name,'歌曲专辑封面')}
      } catch { /* The exact song's artwork remains a valid fallback. */ }
    }
    const url=image(track.artwork)
    if(url) return {url,source:'song-cover',label:label(track.title,'歌曲封面')}
    return
  }
  try {
    const profile=(await audiusGet(env,`/users/${id}`)).data
    if(isRecord(profile) && profile.id===id && !profile.is_deactivated && profile.is_available!==false) {
      const url=image(profile.profile_picture)
      if(url) return {url,source:'artist-avatar',label:`${label(profile.name,'艺人')} · 头像`}
    }
  } catch { /* Try the artist's first album even if the profile request failed. */ }
  const response=await audiusGet(env,`/users/${id}/albums`,{offset:'0',limit:'10'})
  if(!Array.isArray(response.data)) return
  // Preserve provider order: never sort by title or pick an unrelated release.
  for(const album of response.data) {
    if(!isRecord(album) || album.is_album!==true || album.is_delete || album.is_private || !isRecord(album.user) || album.user.id!==id) continue
    const url=image(album.artwork)
    if(url) return {url,source:'artist-album',label:label(album.playlist_name,'艺人专辑封面')}
  }
}

/** Public artwork metadata only. No catalog writes, user-specific cache or API keys in returned URLs. */
export async function resolveGalaxyArtwork(env:Env, by:GalaxyGroupBy, key:string):Promise<GalaxyStarArtwork | undefined> {
  if(by==='genre') return genreArtwork(key)
  const id=providerId(key), cacheKey=`${by}:${key}`
  if(id && env.AUDIUS_API_KEY) {
    const cached=cache.get(cacheKey)
    if(cached && cached.expires>Date.now()) return cached.artwork
    let operation=pending.get(cacheKey)
    if(!operation) {
      operation=providerArtwork(env,by,id).catch(()=>undefined)
      if(pending.size<128) pending.set(cacheKey,operation)
    }
    try {
      const artwork=await operation
      if(artwork) {
        if(cache.size>=128) cache.delete(cache.keys().next().value!)
        cache.set(cacheKey,{artwork,expires:Date.now()+10*60*1000})
        return artwork
      }
    } finally { if(pending.get(cacheKey)===operation)pending.delete(cacheKey) }
  }
  const row=await env.DB.prepare(`SELECT c.cover_url,c.title,c.artist_name FROM music_track_catalog c
    WHERE c.is_active=1 AND c.provider<>'moodverse-demo' AND ${by==='song'?'c.id=?1':'c.artist_id=?1'}
      AND c.cover_url IS NOT NULL
    ORDER BY c.title COLLATE NOCASE,c.id LIMIT 1`).bind(key).first<{cover_url:string;title:string;artist_name:string}>()
  const url=row?safeHttpsUrl(row.cover_url):null
  if(url) return {url,source:by==='song'?'song-cover':'artist-track',label:row!.title}
}
