import { describe, expect, it } from 'vitest'
import { acronymMatches, nameSimilarity } from '../src/main/scanner/similarity'

describe('nameSimilarity', () => {
  it('matches camelCase exe names with titles', () => {
    expect(nameSimilarity('HollowKnight', 'Hollow Knight')).toBeGreaterThan(0.9)
    expect(nameSimilarity('eldenring', 'ELDEN RING')).toBe(1)
  })

  it('scores unrelated names low', () => {
    expect(nameSimilarity('UnityCrashHandler64', 'Hollow Knight')).toBeLessThan(0.3)
  })

  it('understands acronyms', () => {
    expect(acronymMatches('RDR2', 'Red Dead Redemption 2')).toBe(true)
    expect(acronymMatches('gtav', 'Grand Theft Auto V')).toBe(true)
    expect(nameSimilarity('RDR2', 'Red Dead Redemption 2')).toBeGreaterThanOrEqual(0.9)
  })
})
