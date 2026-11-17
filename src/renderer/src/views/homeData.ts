import { useMemo } from 'react'
import type { Game } from '@shared/types'
import { useLauncher } from '../store'

export interface HomeData {
  /** Games shown on Home: installed, not hidden. */
  visible: Game[]
  recentlyPlayed: Game[]
  recentlyAdded: Game[]
  favorites: Game[]
  mostPlayed: Game[]
}

export function useHomeData(): HomeData {
  const games = useLauncher((state) => state.games)
  return useMemo(() => {
    const visible = games.filter((game) => game.category === 'game' && !game.hidden && game.status === 'installed')
    return {
      visible,
      recentlyPlayed: visible.filter((game) => game.lastPlayedAt).sort((a, b) => b.lastPlayedAt!.localeCompare(a.lastPlayedAt!)),
      recentlyAdded: [...visible].sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
      favorites: visible.filter((game) => game.favorite),
      mostPlayed: visible.filter((game) => game.playtimeSeconds > 0).sort((a, b) => b.playtimeSeconds - a.playtimeSeconds)
    }
  }, [games])
}

/** True while a dialog is open, so Home keyboard navigation stays out of the way. */
export function useOverlayOpen(): boolean {
  return useLauncher((state) => state.selectedGameId !== null || state.profileOpen || state.confirmRequest !== null || state.overlayVisible)
}

export async function playGame(game: Game): Promise<void> {
  const { setError } = useLauncher.getState()
  try {
    await window.api.library.launch(game.id)
  } catch (error) {
    setError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
  }
}
