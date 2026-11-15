import { describe, expect, it } from 'vitest'
import { cleanDisplayTitle, cleanSearchTitle, normalizeForComparison } from '../src/main/scanner/nameCleaner'

describe('cleanDisplayTitle', () => {
  const cases: [string, string][] = [
    ['Cyberpunk 2077 [FitGirl Repack]', 'Cyberpunk 2077'],
    ['Cyberpunk.2077.v2.1.[FitGirl.Repack]', 'Cyberpunk 2077'],
    ['ELDEN RING - Deluxe Edition v1.10 + 2 DLCs', 'ELDEN RING Deluxe Edition'],
    ['Hades_II_Build_12345-GOG', 'Hades II'],
    ['The Witcher 3 Wild Hunt GOTY (v4.04) [DODI Repack]', 'The Witcher 3 Wild Hunt GOTY'],
    ['Red Dead Redemption 2 (Build 1491.50, MULTi13) [FitGirl Repack]', 'Red Dead Redemption 2'],
    ['Baldurs.Gate.3-RUNE', 'Baldurs Gate 3'],
    ['S.T.A.L.K.E.R. 2 Heart of Chornobyl v1.0.1', 'S.T.A.L.K.E.R. 2 Heart of Chornobyl'],
    ['DOOM Eternal™', 'DOOM Eternal'],
    ['Stardew Valley v1.6.8', 'Stardew Valley'],
    ['Hollow Knight', 'Hollow Knight'],
    ['Resident Evil 4 - Deluxe Edition (Update 3) + All DLCs + Bonus OST', 'Resident Evil 4 Deluxe Edition'],
    ['Black Myth Wukong [ElAmigos]', 'Black Myth Wukong']
  ]

  it.each(cases)('%s -> %s', (input, expected) => {
    expect(cleanDisplayTitle(input)).toBe(expected)
  })

  it('never returns an empty string', () => {
    expect(cleanDisplayTitle('[FitGirl Repack]')).not.toBe('')
  })
})

describe('cleanSearchTitle', () => {
  it('drops edition words', () => {
    expect(cleanSearchTitle('ELDEN RING - Deluxe Edition v1.10')).toBe('ELDEN RING')
    expect(cleanSearchTitle('The Witcher 3 Wild Hunt GOTY [DODI Repack]')).toBe('The Witcher 3 Wild Hunt')
    expect(cleanSearchTitle('Final Fantasy VII Remake Intergrade')).toBe('Final Fantasy VII Remake Intergrade')
  })
})

describe('normalizeForComparison', () => {
  it('strips accents, case and punctuation', () => {
    expect(normalizeForComparison('Pokémon: Let’s Go!')).toBe('pokemon lets go')
  })
})
