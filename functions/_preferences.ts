import type { Env } from './_shared'
import { THEMES } from './_planet'

export const MAX_FOCUSED_THEMES = 6
export const DEFAULT_FOCUSED_THEMES = [...THEMES].slice(0, MAX_FOCUSED_THEMES)

export function validateFocusedThemes(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_FOCUSED_THEMES) return null
  const result: string[] = []
  for (const theme of value) {
    if (typeof theme !== 'string' || !THEMES.has(theme) || result.includes(theme)) return null
    result.push(theme)
  }
  return result
}

export function parseStoredFocusedThemes(value: string | null | undefined): string[] {
  if (!value) return [...DEFAULT_FOCUSED_THEMES]
  try {
    return validateFocusedThemes(JSON.parse(value)) ?? [...DEFAULT_FOCUSED_THEMES]
  } catch {
    return [...DEFAULT_FOCUSED_THEMES]
  }
}

export async function focusedThemesForUser(env: Env, userId: string): Promise<string[]> {
  const row = await env.DB.prepare('SELECT focused_themes_json FROM user_preferences WHERE user_id = ?1')
    .bind(userId).first<{ focused_themes_json: string }>()
  return parseStoredFocusedThemes(row?.focused_themes_json)
}
