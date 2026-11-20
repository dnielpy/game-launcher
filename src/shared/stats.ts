export interface SessionSpan {
  startedAt: string
  endedAt: string
  seconds: number
}

export interface DayTotal {
  /** Local date, YYYY-MM-DD. */
  date: string
  seconds: number
}

function localKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Play time per local day for the last `days` days, today last. A session that crosses midnight
 * is split by how much of it fell on each day; the recorded seconds are what gets shared out.
 */
export function dailyTotals(sessions: SessionSpan[], days: number, now = new Date()): DayTotal[] {
  const totals = new Map<string, number>()
  const result: DayTotal[] = []
  for (let offset = days - 1; offset >= 0; offset--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    const key = localKey(day)
    totals.set(key, 0)
    result.push({ date: key, seconds: 0 })
  }

  for (const session of sessions) {
    const start = new Date(session.startedAt)
    const end = new Date(session.endedAt)
    if (Number.isNaN(start.getTime()) || session.seconds <= 0) continue
    const span = end.getTime() - start.getTime()
    if (!(span > 0)) {
      const key = localKey(start)
      if (totals.has(key)) totals.set(key, totals.get(key)! + session.seconds)
      continue
    }
    let cursor = start
    while (cursor < end) {
      const nextMidnight = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
      const pieceEnd = nextMidnight < end ? nextMidnight : end
      const key = localKey(cursor)
      if (totals.has(key)) totals.set(key, totals.get(key)! + session.seconds * ((pieceEnd.getTime() - cursor.getTime()) / span))
      cursor = pieceEnd
    }
  }

  return result.map((day) => ({ date: day.date, seconds: Math.round(totals.get(day.date) ?? 0) }))
}
