import type {
  Game,
  EmulatedPlatform,
  EmulationPlatformState,
  ExcludedPath,
  ExportSummary,
  GamePatch,
  ImportSummary,
  LibraryRoot,
  MetadataCandidate,
  MetadataProgress,
  MetadataSource,
  PendingInstaller,
  ProfileState,
  ScanProgress,
  ScanSummary,
  SettingsState,
  SkinId,
  UpdateStatus
} from './types'

export const IpcChannels = {
  libraryList: 'library:list',
  libraryUpdate: 'library:update',
  libraryLaunch: 'library:launch',
  libraryOpenFolder: 'library:open-folder',
  libraryChanged: 'library:changed',
  libraryRemove: 'library:remove',
  libraryChooseLaunchFile: 'library:choose-launch-file',
  libraryRelocate: 'library:relocate',
  libraryDelete: 'library:delete',
  exclusionsList: 'exclusions:list',
  exclusionsPick: 'exclusions:pick',
  exclusionsAdd: 'exclusions:add',
  exclusionsRemove: 'exclusions:remove',
  emulationGet: 'emulation:get',
  emulationSetEnabled: 'emulation:set-enabled',
  emulationSetEmulator: 'emulation:set-emulator',
  settingsSetSteamGridDbKey: 'settings:set-steamgriddb-key',
  settingsSetSkin: 'settings:set-skin',
  profileGet: 'profile:get',
  profileSave: 'profile:save',
  profileChoosePhoto: 'profile:choose-photo',
  profileRemovePhoto: 'profile:remove-photo',
  profileDelete: 'profile:delete',
  dataExport: 'data:export',
  dataImport: 'data:import',
  emulatorsAdd: 'emulators:add',
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
  openExternal: 'app:open-external',
  updatesGet: 'updates:get',
  updatesCheck: 'updates:check',
  updatesDownload: 'updates:download',
  updatesCancel: 'updates:cancel',
  updatesInstall: 'updates:install',
  updatesStatus: 'updates:status'
} as const

export type Unsubscribe = () => void

export interface LauncherApi {
  library: {
    list(): Promise<Game[]>
    update(id: number, patch: GamePatch): Promise<Game>
    launch(id: number): Promise<void>
    openFolder(id: number): Promise<void>
    /** Deletes entries added by hand; hides detected ones so the next scan does not bring them back. */
    remove(id: number): Promise<void>
    /** Opens a file picker in the game folder to choose what starts the game (.exe, .bat, .cmd, a shortcut...). Null when cancelled. */
    chooseLaunchFile(id: number): Promise<Game | null>
    /** Opens a folder picker to point the game at a new location (moved or reinstalled). Null when cancelled. */
    relocate(id: number): Promise<Game | null>
    /** Takes the game out of the library for good and excludes its location, so scans never bring it back. */
    delete(id: number): Promise<void>
    /** Fires when games change outside the renderer: new covers, finished play sessions. */
    onChanged(listener: (payload: { runningGameIds: number[] }) => void): Unsubscribe
  }
  exclusions: {
    list(): Promise<ExcludedPath[]>
    /** Opens a folder picker. Returns the chosen folder without excluding it yet; null when cancelled. */
    pick(): Promise<string | null>
    /** Excludes a folder. Games inside it leave the library. */
    add(path: string): Promise<void>
    /** Stops excluding a folder; the next scan looks there again. */
    remove(id: number): Promise<void>
  }
  emulation: {
    get(platform: EmulatedPlatform): Promise<EmulationPlatformState>
    /** Turning a console on starts a scan for its games. */
    setEnabled(platform: EmulatedPlatform, enabled: boolean): Promise<EmulationPlatformState>
    /** null goes back to picking the emulator automatically. */
    setEmulator(platform: EmulatedPlatform, emulatorId: number | null): Promise<EmulationPlatformState>
  }
  emulators: {
    /** Opens a file picker for the emulator's executable. Resolves to null when the user cancels. */
    add(): Promise<Game | null>
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
    /** With a game id, searches the catalogs that fit that game's platform. */
    search(query: string, gameId?: number): Promise<MetadataCandidate[]>
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
    setSteamGridDbKey(key: string | null): Promise<SettingsState>
    setSkin(skin: SkinId): Promise<SettingsState>
  }
  updates: {
    get(): Promise<UpdateStatus>
    check(): Promise<UpdateStatus>
    /** Starts the download. Progress arrives through onStatus. */
    download(): Promise<void>
    cancel(): Promise<void>
    /** Closes Orus and runs the downloaded installer. */
    install(): Promise<void>
    onStatus(listener: (status: UpdateStatus) => void): Unsubscribe
  }
  profile: {
    get(): Promise<ProfileState>
    /** Sets the name. The first call creates the profile. */
    save(name: string): Promise<ProfileState>
    /** Opens an image picker; the photo is cropped to a square. Null when cancelled. */
    choosePhoto(): Promise<ProfileState | null>
    removePhoto(): Promise<ProfileState>
    /** Deletes the profile. Play history stays. */
    remove(): Promise<ProfileState>
  }
  data: {
    /** Asks where to save, then writes games, play time, images and profile to one file. Null when cancelled. */
    export(): Promise<ExportSummary | null>
    /** Asks for a file and merges it into this library. Null when cancelled. */
    import(): Promise<ImportSummary | null>
  }
  openExternal(url: string): Promise<void>
}
