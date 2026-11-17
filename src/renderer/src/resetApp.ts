import { errorMessage, useLauncher } from './store'

/**
 * Deletes the profile and everything else, after a backup that is read back to be sure.
 * Orus then restarts at the welcome screens.
 */
export async function startOver(): Promise<void> {
  const { confirm, setError } = useLauncher.getState()
  const ok = await confirm({
    title: 'Delete your profile and start over?',
    message:
      'First Orus saves a full backup to Documents\\Orus backups and checks that it reads back: games, hours, covers, details, favorites, locations, settings and your profile.\n\nThen it deletes all of that from Orus and restarts at the welcome screen, where you can restore the backup if you change your mind. Your games on disk are not touched.',
    confirmLabel: 'Back up and start over',
    danger: true
  })
  if (!ok) return
  useLauncher.setState({ resetting: 'saving', profileOpen: false, selectedGameId: null })
  try {
    await window.api.app.resetEverything()
    useLauncher.setState({ resetting: 'restarting' })
  } catch (error) {
    useLauncher.setState({ resetting: null })
    setError(`Nothing was deleted: ${errorMessage(error)}`)
  }
}
