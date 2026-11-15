import { describe, expect, it } from 'vitest'
import { cleanDisplayTitle, cleanSearchTitle, looksLikeUpdateName, normalizeForComparison } from '../src/main/scanner/nameCleaner'

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
    ['Black Myth Wukong [ElAmigos]', 'Black Myth Wukong'],
    // Real folder names from a user library
    ['Cyberpunk 2077 2024 PC 300 MN', 'Cyberpunk 2077'],
    ['Cyberpunk 2077 MULTi18 ElAmigos versión 2.12', 'Cyberpunk 2077'],
    ['Forza Horizon 6 MULTi23 ElAmigos versión 354.221', 'Forza Horizon 6'],
    ['Forza Horizon 6 364.933', 'Forza Horizon 6'],
    ['Forza Horizon 5 Premium Edition MULTi16 ElAmigos', 'Forza Horizon 5 Premium Edition'],
    ['FH6 360.259', 'FH6'],
    ['Grand Theft Auto V Enhanced 889.15', 'Grand Theft Auto V Enhanced'],
    ['Grand Theft Auto V Enhanced update 814.9 - 889.15', 'Grand Theft Auto V Enhanced'],
    ['Grand Theft Auto V Enhanced MULTi13 ElAmigos', 'Grand Theft Auto V Enhanced'],
    ['Grand Theft Auto V Enhanced [47.26 Gb]', 'Grand Theft Auto V Enhanced'],
    ['World of Warcraft 3.3.5a 12340 enUS', 'World of Warcraft'],
    ['FIFA 23', 'FIFA 23'],
    ['Call of Duty: Black Ops III', 'Call of Duty: Black Ops III'],
    ['Metro 2033 Redux', 'Metro 2033 Redux'],
    ['PC Building Simulator', 'PC Building Simulator'],
    ['Half-Life 2', 'Half-Life 2']
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

describe('looksLikeUpdateName', () => {
  it('spots update packages', () => {
    expect(looksLikeUpdateName('Grand Theft Auto V Enhanced update 814.9 - 889.15')).toBe(true)
    expect(looksLikeUpdateName('Forza_Horizon_6_Update_v364.933')).toBe(true)
    expect(looksLikeUpdateName('Grand Theft Auto V Enhanced')).toBe(false)
    expect(looksLikeUpdateName('Patch Quest')).toBe(false)
  })
})

describe('normalizeForComparison', () => {
  it('strips accents, case and punctuation', () => {
    expect(normalizeForComparison('Pokémon: Let’s Go!')).toBe('pokemon lets go')
  })
})
