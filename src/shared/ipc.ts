import type {
  Game,
  GamePatch,
  LibraryRoot,
  MetadataCandidate,
  MetadataProgress,
  MetadataSource,
  PendingInstaller,
  ScanProgress,
  ScanSummary,
  SettingsState
} from './types'

export const IpcChannels = {
  libraryList: 'library:list',
  libraryUpdate: 'library:update',
  libraryLaunch: 'library:launch',
  libraryOpenFolder: 'library:open-folder',
  libraryChanged: 'library:changed',
  installersList: 'installers:list',
  rootsList: 'roots:list',
  rootsAdd: 'roots:add',
  rootsRemove: 'roots:remove',
  rootsSetEnabled: 'roots:set-enabled',
  scanStart: 'scan:start',
  scanCancel: 'scan:cancel',
  scanIsRunning: 'scan:is-running',
  scanProgress: 'scan:progress',
  scanFinished: 'scan:finished',
  metadataSearch: 'metadata:search',
  metadataAssign: 'metadata:assign',
  metadataClear: 'metadata:clear',
  metadataRefresh: 'metadata:refresh',
  metadataProgress: 'metadata:progress',
  metadataGetProgress: 'metadata:get-progress',
  settingsGet: 'settings:get',
  settingsSetRawgKey: 'settings:set-rawg-key',
  openExternal: 'app:open-external'
} as const

export type Unsubscribe = () => void

export interface LauncherApi {
  library: {
    list(): Promise<Game[]>
    update(id: number, patch: GamePatch): Promise<Game>
    launch(id: number): Promise<void>
    openFolder(id: number): Promise<void>
    /** Fires when games change outside the renderer: new covers, finished play sessions. */
    onChanged(listener: (payload: { runningGameIds: number[] }) => void): Unsubscribe
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
  metadata: {
    search(query: string): Promise<MetadataCandidate[]>
    assign(gameId: number, source: MetadataSource, externalId: string): Promise<Game>
    /** Removes the match and keeps the game without cover or info. */
    clear(gameId: number): Promise<Game>
    refresh(gameId: number): Promise<Game>
    getProgress(): Promise<MetadataProgress>
    onProgress(listener: (progress: MetadataProgress) => void): Unsubscribe
  }
  settings: {
    get(): Promise<SettingsState>
    setRawgKey(key: string | null): Promise<SettingsState>
  }
  openExternal(url: string): Promise<void>
}
