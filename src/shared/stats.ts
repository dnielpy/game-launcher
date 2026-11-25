export interface SessionSpan {
  startedAt: string
  endedAt: string
  seconds: number
  gameId?: number
}

export interface DayTotal {
  /** Local date, YYYY-MM-DD. */
  date: string
  seconds: number
  /** The game played the longest that day, or null when nothing was played. */
  topGameId: number | null
}

function localKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Play time per local day for the last `days` days, today last. A session that crosses midnight
 * is split by how much of it fell on each day; the recorded seconds are what gets shared out.
 * Each day also names the game with the most time on it.
 */
export function dailyTotals(sessions: SessionSpan[], days: number, now = new Date()): DayTotal[] {
  const totals = new Map<string, number>()
  const perGame = new Map<string, Map<number, number>>()
  const result: DayTotal[] = []
  const add = (key: string, gameId: number | undefined, seconds: number) => {
    if (!totals.has(key)) return
    totals.set(key, totals.get(key)! + seconds)
    if (gameId === undefined) return
    const games = perGame.get(key) ?? new Map<number, number>()
    games.set(gameId, (games.get(gameId) ?? 0) + seconds)
    perGame.set(key, games)
  }
  for (let offset = days - 1; offset >= 0; offset--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    const key = localKey(day)
    totals.set(key, 0)
    result.push({ date: key, seconds: 0, topGameId: null })
  }

  for (const session of sessions) {
    const start = new Date(session.startedAt)
    const end = new Date(session.endedAt)
    if (Number.isNaN(start.getTime()) || session.seconds <= 0) continue
    const span = end.getTime() - start.getTime()
    if (!(span > 0)) {
      add(localKey(start), session.gameId, session.seconds)
      continue
    }
    let cursor = start
    while (cursor < end) {
      const nextMidnight = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
      const pieceEnd = nextMidnight < end ? nextMidnight : end
      add(localKey(cursor), session.gameId, session.seconds * ((pieceEnd.getTime() - cursor.getTime()) / span))
      cursor = pieceEnd
    }
  }

  return result.map((day) => {
    let topGameId: number | null = null
    let best = 0
    for (const [gameId, seconds] of perGame.get(day.date) ?? []) {
      if (seconds > best) {
        best = seconds
        topGameId = gameId
      }
    }
    const seconds = Math.round(totals.get(day.date) ?? 0)
    return { date: day.date, seconds, topGameId: seconds > 0 ? topGameId : null }
  })
}
