import type { Game, GamePatch, LibraryRoot, PendingInstaller, ScanProgress, ScanSummary } from './types'

export const IpcChannels = {
  libraryList: 'library:list',
  libraryUpdate: 'library:update',
  libraryLaunch: 'library:launch',
  libraryOpenFolder: 'library:open-folder',
  installersList: 'installers:list',
  rootsList: 'roots:list',
  rootsAdd: 'roots:add',
  rootsRemove: 'roots:remove',
  rootsSetEnabled: 'roots:set-enabled',
  scanStart: 'scan:start',
  scanCancel: 'scan:cancel',
  scanIsRunning: 'scan:is-running',
  scanProgress: 'scan:progress',
  scanFinished: 'scan:finished'
} as const

export type Unsubscribe = () => void

export interface LauncherApi {
  library: {
    list(): Promise<Game[]>
    update(id: number, patch: GamePatch): Promise<Game>
    launch(id: number): Promise<void>
    openFolder(id: number): Promise<void>
  }
  installers: {
    list(): Promise<PendingInstaller[]>
  }
  roots: {
    list(): Promise<LibraryRoot[]>
    /** Opens a folder picker. Resolves to null when the user cancels. */
    add(): Promise<LibraryRoot | null>
    remove(id: number): Promise<void>
    setEnabled(id: number, enabled: boolean): Promise<void>
  }
  scan: {
    start(): Promise<void>
    cancel(): Promise<void>
    isRunning(): Promise<boolean>
    onProgress(listener: (progress: ScanProgress) => void): Unsubscribe
    onFinished(listener: (result: { summary: ScanSummary | null; error: string | null }) => void): Unsubscribe
  }
}
