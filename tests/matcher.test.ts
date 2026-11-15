import { describe, expect, it } from 'vitest'
import { matchScore, pickBest, searchQueries } from '../src/main/metadata/matcher'

const pick = (names: string[], title: string) => pickBest(names, (name) => name, title)?.item ?? null

describe('matchScore', () => {
  it('treats roman numerals, symbols and case as equal', () => {
    expect(matchScore('Call of Duty®: Black Ops III', 'Call of Duty Black Ops 3')).toBe(1)
    expect(matchScore('METAL GEAR SOLID V: THE PHANTOM PAIN', 'Metal Gear Solid V The Phantom Pain')).toBe(1)
  })
})

describe('pickBest', () => {
  it('prefers the exact game over its DLCs and soundtracks', () => {
    expect(pick(['Cyberpunk 2077: Phantom Liberty', 'Cyberpunk 2077', 'Cyberpunk 2077 Soundtrack'], 'Cyberpunk 2077')).toBe('Cyberpunk 2077')
  })

  it('matches a store name that is the start of a longer local name', () => {
    expect(pick(['Forza Horizon 4', 'Forza Horizon 5'], 'Forza Horizon 5 Premium Edition')).toBe('Forza Horizon 5')
    expect(pick(['Grand Theft Auto V Legacy', 'Grand Theft Auto V Enhanced'], 'Grand Theft Auto V Enhanced')).toBe('Grand Theft Auto V Enhanced')
  })

  it('accepts a store name with a publisher prefix', () => {
    expect(pick(['EA SPORTS™ FIFA 23'], 'FIFA 23')).toBe('EA SPORTS™ FIFA 23')
  })

  it('rejects unrelated results', () => {
    expect(pick(['Forza Motorsport', 'Horizon Zero Dawn'], 'Forza Horizon 6')).toBeNull()
    expect(pick(['Terraria: Otherworld Soundtrack'], 'Terraria')).toBeNull()
  })

  it('does not take a sequel for the original', () => {
    expect(pick(['Hollow Knight: Silksong', 'Hollow Knight'], 'Hollow Knight')).toBe('Hollow Knight')
    expect(pick(['Forza Horizon 5'], 'Forza Horizon 6')).toBeNull()
  })
})

describe('searchQueries', () => {
  it('tries the full name first, then shorter versions', () => {
    expect(searchQueries('Forza Horizon 5 Premium Edition', 'Forza Horizon 5')).toEqual(['Forza Horizon 5 Premium Edition', 'Forza Horizon 5', 'Forza Horizon'])
  })
})

describe('sequel numbers', () => {
  it('never matches the first game for a numbered sequel', () => {
    expect(pick(['Forza Horizon', 'Forza Horizon 4'], 'Forza Horizon 6')).toBeNull()
  })
})
