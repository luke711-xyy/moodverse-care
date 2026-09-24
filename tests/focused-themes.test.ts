import { expect, test } from 'vitest'
import { DEFAULT_FOCUSED_THEMES, parseStoredFocusedThemes, validateFocusedThemes } from '../functions/_preferences.ts'
import { DEFAULT_FOCUSED_THEMES as CLIENT_DEFAULTS, MAX_FOCUSED_THEMES, THEMES } from '../src/types.ts'

test('new and existing users retain the original six-topic default', () => {
  expect(DEFAULT_FOCUSED_THEMES).toEqual(['study', 'career', 'court', 'lens', 'create', 'care'])
  expect(DEFAULT_FOCUSED_THEMES).toEqual(CLIENT_DEFAULTS)
  expect(parseStoredFocusedThemes(null)).toEqual(DEFAULT_FOCUSED_THEMES)
})

test('focused theme preferences accept zero through six known unique themes', () => {
  expect(validateFocusedThemes([])).toEqual([])
  expect(validateFocusedThemes(THEMES.slice(0, MAX_FOCUSED_THEMES).map((theme) => theme.id))).toHaveLength(MAX_FOCUSED_THEMES)
  expect(validateFocusedThemes(THEMES.slice(0, MAX_FOCUSED_THEMES + 1).map((theme) => theme.id))).toBeNull()
  expect(validateFocusedThemes(['study', 'study'])).toBeNull()
  expect(validateFocusedThemes(['not-a-theme'])).toBeNull()
  expect(validateFocusedThemes('study')).toBeNull()
})

test('corrupt stored preferences fall back safely without exposing an invalid topic set', () => {
  expect(parseStoredFocusedThemes('{broken')).toEqual(DEFAULT_FOCUSED_THEMES)
  expect(parseStoredFocusedThemes('["study","unknown"]')).toEqual(DEFAULT_FOCUSED_THEMES)
})
