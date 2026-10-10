/** Audius canonical music genres; non-music spoken-word categories omitted. */
export const AUDIUS_GENRES = ['Electronic', 'Rock', 'Metal', 'Alternative', 'Hip-Hop/Rap', 'Experimental', 'Punk', 'Folk', 'Pop', 'Ambient', 'Soundtrack', 'World', 'Jazz', 'Acoustic', 'Funk', 'R&B/Soul', 'Devotional', 'Classical', 'Reggae', 'Country', 'Blues', 'Kids', 'Latin', 'Lo-Fi', 'Hyperpop', 'Dancehall', 'Techno', 'Trap', 'House', 'Tech House', 'Deep House', 'Disco', 'Electro', 'Jungle', 'Progressive House', 'Hardstyle', 'Glitch Hop', 'Trance', 'Future Bass', 'Future House', 'Tropical House', 'Downtempo', 'Drum & Bass', 'Dubstep', 'Jersey Club', 'Vaporwave', 'Moombahton'] as const
export const DEFAULT_GALAXY_GENRES = ['Pop', 'Rock', 'Hip-Hop/Rap', 'Electronic', 'R&B/Soul', 'Jazz', 'Classical', 'Ambient']
export function normalizeGalaxyGenres(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) return null
  const genres = value.map(item => typeof item === 'string' ? AUDIUS_GENRES.find(g => g.toLowerCase() === item.trim().toLowerCase()) : undefined)
  if (genres.some(g => !g) || new Set(genres).size !== genres.length) return null
  return genres as string[]
}
