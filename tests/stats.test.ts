import { describe, expect, it } from 'vitest'
import { dailyTotals } from '../src/shared/stats'

const iso = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).toISOString()

describe('dailyTotals', () => {
  it('gives seven local days, today last, with each session on its day', () => {
    const now = new Date(2026, 10, 19, 22, 0)
    const result = dailyTotals(
      [
        { startedAt: iso(2026, 11, 19, 20), endedAt: iso(2026, 11, 19, 21), seconds: 3600 },
        { startedAt: iso(2026, 11, 17, 10), endedAt: iso(2026, 11, 17, 10, 30), seconds: 1800 },
        { startedAt: iso(2026, 11, 1, 10), endedAt: iso(2026, 11, 1, 11), seconds: 3600 }
      ],
      7,
      now
    )
    expect(result.map((day) => day.date)).toEqual(['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19'])
    expect(result.map((day) => day.seconds)).toEqual([0, 0, 0, 0, 1800, 0, 3600])
  })

  it('splits a session that crosses midnight', () => {
    const now = new Date(2026, 10, 19, 12, 0)
    const result = dailyTotals([{ startedAt: iso(2026, 11, 18, 23), endedAt: iso(2026, 11, 19, 1), seconds: 7200 }], 2, now)
    expect(result).toEqual([
      { date: '2026-11-18', seconds: 3600, topGameId: null },
      { date: '2026-11-19', seconds: 3600, topGameId: null }
    ])
  })

  it('names the game played the longest each day', () => {
    const now = new Date(2026, 10, 19, 22, 0)
    const result = dailyTotals(
      [
        { gameId: 1, startedAt: iso(2026, 11, 19, 10), endedAt: iso(2026, 11, 19, 10, 30), seconds: 1800 },
        { gameId: 2, startedAt: iso(2026, 11, 19, 12), endedAt: iso(2026, 11, 19, 13), seconds: 3600 },
        { gameId: 1, startedAt: iso(2026, 11, 19, 18), endedAt: iso(2026, 11, 19, 18, 20), seconds: 1200 },
        { gameId: 3, startedAt: iso(2026, 11, 18, 23), endedAt: iso(2026, 11, 19, 0, 10), seconds: 4200 }
      ],
      3,
      now
    )
    expect(result.map((day) => day.topGameId)).toEqual([null, 3, 2])
  })
})
