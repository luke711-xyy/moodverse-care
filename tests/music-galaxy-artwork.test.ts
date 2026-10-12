import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { resolveGalaxyArtwork } from '../functions/_music-galaxy-artwork'
import { genreArtwork } from '../src/music/genre-artwork'
import { AUDIUS_GENRES } from '../src/music/genres'
import { createMusicApiEnv, createMusicApiFixture, insertCatalogTrack } from './helpers/music-api-fixture'

let fixture: ReturnType<typeof createMusicApiFixture>
beforeEach(()=>{fixture=createMusicApiFixture()})
afterEach(()=>{fixture.close();vi.unstubAllGlobals()})
const env=()=>createMusicApiEnv(fixture.db,{AUDIUS_API_KEY:'never-expose-this-key'})
const localCover=(id:string,artist='artist-1')=>{
  insertCatalogTrack(fixture.sqlite,{id,title:'Local song',artistName:'The artist'})
  fixture.sqlite.prepare('UPDATE music_track_catalog SET artist_id=?,cover_url=? WHERE id=?').run(artist,'https://covers.example/local.jpg',id)
}

test('every selectable genre has its own fixed square artwork with a source, including Jazz', () => {
  const urls=new Set<string>()
  for(const genre of AUDIUS_GENRES) {
    const art=genreArtwork(genre.toLowerCase())!
    expect(art).toBeTruthy();expect(art.source).toBe('genre-image')
    expect(new URL(art.url).protocol).toBe('https:')
    expect(art.url).toContain('512x512')
    expect(art.label).toBeTruthy();expect(new URL(art.sourceUrl!).hostname).toBe('music.apple.com')
    urls.add(art.url)
  }
  expect(urls.size).toBe(AUDIUS_GENRES.length)
  expect(genreArtwork('Jazz')?.label).toContain('Kind of Blue')
  expect(genreArtwork('not-a-genre')).toBeUndefined()
})
test('catalog songs use their own cover without requiring live API credentials', async () => {
  localCover('song-local')
  const art=await resolveGalaxyArtwork(createMusicApiEnv(fixture.db),'song','song-local')
  expect(art).toMatchObject({url:'https://covers.example/local.jpg',source:'song-cover'})
  fixture.sqlite.prepare('UPDATE music_track_catalog SET cover_url=? WHERE id=?').run('javascript:alert(1)','song-local')
  expect(await resolveGalaxyArtwork(createMusicApiEnv(fixture.db),'song','song-local')).toBeUndefined()
})
test('a song belonging to an album uses that album cover rather than its track artwork', async () => {
  localCover('audius:SongAlbum')
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{
    const path=new URL(String(input)).pathname
    if(path==='/v1/tracks/SongAlbum') return Response.json({data:{id:'SongAlbum',title:'Song',artwork:{'480x480':'https://covers.example/track.jpg'},album_backlink:{playlist_id:'Album1'}}})
    if(path==='/v1/playlists/Album1') return Response.json({data:[{id:'Album1',is_album:true,playlist_name:'First album',artwork:{'480x480':'https://covers.example/album.jpg'}}]})
    throw Error('Unexpected endpoint')
  })
  const art=await resolveGalaxyArtwork(env(),'song','audius:SongAlbum')
  expect(art).toMatchObject({url:'https://covers.example/album.jpg',source:'song-cover',label:'First album'})
  expect(JSON.stringify(art)).not.toContain('never-expose')
})
test('artist profile pictures take precedence over album covers and are cached across chart reads', async () => {
  let calls=0
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{
    calls++
    if(new URL(String(input)).pathname!=='/v1/users/AvatarArtist') throw Error('Albums must not be fetched with an avatar')
    return Response.json({data:{id:'AvatarArtist',name:'Artist',profile_picture:{'480x480':'https://covers.example/avatar.jpg'}}})
  })
  expect(await resolveGalaxyArtwork(env(),'artist','audius:AvatarArtist')).toMatchObject({url:'https://covers.example/avatar.jpg',source:'artist-avatar'})
  expect(await resolveGalaxyArtwork(env(),'artist','audius:AvatarArtist')).toMatchObject({url:'https://covers.example/avatar.jpg'})
  expect(calls).toBe(1)
})
test('numeric Audius album backlinks resolve the encoded album response by its playlist_id', async () => {
  vi.stubGlobal('fetch', async (input:RequestInfo|URL) => {
    const path=new URL(String(input)).pathname
    if(path==='/v1/tracks/NumericAlbumSong') return Response.json({data:{id:'NumericAlbumSong',artwork:{'480x480':'https://covers.example/track.jpg'},album_backlink:{playlist_id:1975641973}}})
    if(path==='/v1/playlists/1975641973') return Response.json({data:[{id:'qJ95rba',playlist_id:1975641973,is_album:true,playlist_name:'Actual album',artwork:{'480x480':'https://covers.example/numeric-album.jpg'}}]})
    throw Error('Unexpected endpoint')
  })
  expect(await resolveGalaxyArtwork(env(),'song','audius:NumericAlbumSong')).toMatchObject({url:'https://covers.example/numeric-album.jpg',label:'Actual album'})
})
test('missing or unsafe avatars fall back to the first matching artist album in provider order', async () => {
  vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{
    const path=new URL(String(input)).pathname
    return Response.json({data:path.endsWith('/albums')?[
      {id:'ForeignAlbum',is_album:true,user:{id:'WrongArtist'},artwork:{'480x480':'https://covers.example/foreign.jpg'}},
      {id:'FirstAlbum',is_album:true,user:{id:'AlbumArtist'},playlist_name:'First album',artwork:{'480x480':'https://covers.example/first.jpg'}},
      {id:'SecondAlbum',is_album:true,user:{id:'AlbumArtist'},playlist_name:'Second album',artwork:{'480x480':'https://covers.example/second.jpg'}},
    ]:{id:'AlbumArtist',name:'Artist',profile_picture:{'480x480':'https://user:pass@covers.example/avatar.jpg'}}})
  })
  expect(await resolveGalaxyArtwork(env(),'artist','audius:AlbumArtist')).toMatchObject({url:'https://covers.example/first.jpg',source:'artist-album',label:'First album'})
})
test('provider failures preserve a real local cover and missing images do not break the chart', async () => {
  localCover('audius:OfflineSong','audius:OfflineArtist')
  vi.stubGlobal('fetch',async()=>{throw Error('offline')})
  expect(await resolveGalaxyArtwork(env(),'song','audius:OfflineSong')).toMatchObject({url:'https://covers.example/local.jpg'})
  expect(await resolveGalaxyArtwork(env(),'artist','audius:OfflineArtist')).toMatchObject({url:'https://covers.example/local.jpg',source:'artist-track'})
  expect(await resolveGalaxyArtwork(env(),'artist','audius:NoPictures')).toBeUndefined()
})
