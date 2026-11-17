import type { Game } from '@shared/types'
import { formatPlaytime } from './format'
import { errorMessage, useLauncher } from './store'

/** Asks, then removes the game for good and excludes its location. Returns true when it was removed. */
export async function removeFromLibrary(game: Game): Promise<boolean> {
  const { confirm, refresh, setError, select } = useLauncher.getState()
  const hours = game.playtimeSeconds >= 60 ? ` Its ${formatPlaytime(game.playtimeSeconds)} of play time and its cover go too.` : ''
  const confirmed = await confirm({
    title: `Remove ${game.title}?`,
    message: `It leaves your library and Orus stops looking in:\n${game.installPath}\n\nNothing is deleted from your disk.${hours} You can look there again from Settings, Game locations, Excluded.`,
    confirmLabel: 'Remove from library',
    danger: true
  })
  if (!confirmed) return false
  try {
    await window.api.library.delete(game.id)
    if (useLauncher.getState().selectedGameId === game.id) select(null)
    await refresh()
    return true
  } catch (error) {
    setError(errorMessage(error))
    return false
  }
}
