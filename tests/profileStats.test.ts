import { describe, expect, it } from 'vitest'
import { computeProfileStats, formatTotalHours } from '../src/shared/profileStats'
import type { Game } from '../src/shared/types'

function game(id: number, title: string, playtimeSeconds: number, overrides: Partial<Game> = {}): Game {
  return { id, title, playtimeSeconds, sessionCount: playtimeSeconds > 0 ? 2 : 0, category: 'game', status: 'installed', ...overrides } as Game
}

describe('computeProfileStats', () => {
  it('ranks games by play time and keeps games that are no longer installed', () => {
    const stats = computeProfileStats([
      game(1, 'Short', 3600),
      game(2, 'Long', 7200 * 10),
      game(3, 'Gone', 7200, { status: 'missing' }),
      game(4, 'Never played', 0)
    ])
    expect(stats.ranking.map((item) => item.title)).toEqual(['Long', 'Gone', 'Short'])
    expect(stats.totalSeconds).toBe(3600 + 72000 + 7200)
    expect(stats.gamesPlayed).toBe(3)
    expect(stats.sessions).toBe(6)
  })

  it('leaves emulators and tools out and limits the ranking', () => {
    const many = Array.from({ length: 15 }, (_, index) => game(index + 1, `Game ${index}`, 1000 + index))
    const stats = computeProfileStats([...many, game(100, 'Dolphin', 99999, { category: 'emulator' })], 10)
    expect(stats.ranking).toHaveLength(10)
    expect(stats.ranking.some((item) => item.title === 'Dolphin')).toBe(false)
  })
})

describe('formatTotalHours', () => {
  it('formats hours and minutes', () => {
    expect(formatTotalHours(0)).toBe('0 h')
    expect(formatTotalHours(45 * 60)).toBe('45 min')
    expect(formatTotalHours(3600 * 7 + 1800)).toBe('7 h 30 min')
    expect(formatTotalHours(3600 * 12 + 1800)).toBe('12 h')
    expect(formatTotalHours(3600 * 128 + 1800)).toBe('128 h')
  })
})
