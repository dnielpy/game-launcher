import type { Game } from '@shared/types'

export interface ProfileStats {
  totalSeconds: number
  gamesPlayed: number
  sessions: number
  /** Most played games first, only games with play time. */
  ranking: Game[]
}

/** Totals for the profile. Only games count (not emulators or tools), including ones that are no longer installed. */
export function computeProfileStats(games: Game[], rankingSize = 10): ProfileStats {
  const played = games.filter((game) => game.category === 'game' && game.playtimeSeconds > 0)
  const ranking = [...played].sort((a, b) => b.playtimeSeconds - a.playtimeSeconds || a.title.localeCompare(b.title))
  return {
    totalSeconds: played.reduce((sum, game) => sum + game.playtimeSeconds, 0),
    gamesPlayed: played.length,
    sessions: played.reduce((sum, game) => sum + game.sessionCount, 0),
    ranking: ranking.slice(0, rankingSize)
  }
}

/** "128 h", "7 h 30 min", "45 min", "0 h". From 10 hours up the minutes are dropped so the number stays short. */
export function formatTotalHours(seconds: number): string {
  if (seconds < 60) return '0 h'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours === 0) return `${minutes} min`
  if (hours >= 10) return `${hours} h`
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`
}
