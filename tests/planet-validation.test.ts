import { describe, expect, it } from 'vitest'

import { parseCheckIn } from '../functions/_planet.ts'

describe('public billboard message limits', () => {
  it('keeps public billboard text within 500 characters on the server', () => {
    const parsed = parseCheckIn({ mood: 'calm', intensity: 3, privacy: 'billboard_public', publicMessage: '星'.repeat(501) })

    expect(parsed?.publicMessage).toHaveLength(500)
  })

  it('does not trim a public billboard message shorter than the limit', () => {
    const message = '星'.repeat(500)
    const parsed = parseCheckIn({ mood: 'calm', intensity: 3, privacy: 'billboard_public', publicMessage: message })

    expect(parsed?.publicMessage).toBe(message)
  })
})
