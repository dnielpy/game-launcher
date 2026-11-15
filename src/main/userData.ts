import { app } from 'electron'
import { cpSync, existsSync, renameSync } from 'node:fs'
import path from 'node:path'

/** Folders used by builds released before the app was called Orus. */
const LEGACY_FOLDERS = ['game-launcher', 'Game Launcher']

/**
 * Data lives in %APPDATA%/Orus. The first time Orus starts after an older build,
 * the old folder (library, covers, play time) is moved there so nothing is lost.
 * Must run before the app is ready.
 */
export function configureUserData(): void {
  const appData = app.getPath('appData')
  const target = path.join(appData, 'Orus')

  if (!existsSync(path.join(target, 'library.db'))) {
    const legacy = LEGACY_FOLDERS.map((folder) => path.join(appData, folder)).find((folder) => existsSync(path.join(folder, 'library.db')))
    if (legacy) {
      try {
        if (existsSync(target)) cpSync(legacy, target, { recursive: true, force: false })
        else renameSync(legacy, target)
      } catch {
        // A locked folder: keep using the old location rather than starting empty.
        app.setPath('userData', legacy)
        return
      }
    }
  }
  app.setPath('userData', target)
}
