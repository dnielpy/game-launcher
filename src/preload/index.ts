import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannels, type LauncherApi } from '../shared/ipc'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: LauncherApi = {
  library: {
    list: () => ipcRenderer.invoke(IpcChannels.libraryList),
    update: (id, patch) => ipcRenderer.invoke(IpcChannels.libraryUpdate, id, patch),
    launch: (id) => ipcRenderer.invoke(IpcChannels.libraryLaunch, id),
    openFolder: (id) => ipcRenderer.invoke(IpcChannels.libraryOpenFolder, id),
    remove: (id) => ipcRenderer.invoke(IpcChannels.libraryRemove, id),
    chooseLaunchFile: (id) => ipcRenderer.invoke(IpcChannels.libraryChooseLaunchFile, id),
    relocate: (id) => ipcRenderer.invoke(IpcChannels.libraryRelocate, id),
    delete: (id) => ipcRenderer.invoke(IpcChannels.libraryDelete, id),
    onChanged: (listener) => subscribe(IpcChannels.libraryChanged, listener)
  },
  exclusions: {
    list: () => ipcRenderer.invoke(IpcChannels.exclusionsList),
    pick: () => ipcRenderer.invoke(IpcChannels.exclusionsPick),
    add: (path) => ipcRenderer.invoke(IpcChannels.exclusionsAdd, path),
    remove: (id) => ipcRenderer.invoke(IpcChannels.exclusionsRemove, id)
  },
  emulation: {
    get: (platform) => ipcRenderer.invoke(IpcChannels.emulationGet, platform),
    setEnabled: (platform, enabled) => ipcRenderer.invoke(IpcChannels.emulationSetEnabled, platform, enabled),
    setEmulator: (platform, emulatorId) => ipcRenderer.invoke(IpcChannels.emulationSetEmulator, platform, emulatorId)
  },
  emulators: {
    add: () => ipcRenderer.invoke(IpcChannels.emulatorsAdd)
  },
  installers: {
    list: () => ipcRenderer.invoke(IpcChannels.installersList)
  },
  roots: {
    list: () => ipcRenderer.invoke(IpcChannels.rootsList),
    add: () => ipcRenderer.invoke(IpcChannels.rootsAdd),
    remove: (id) => ipcRenderer.invoke(IpcChannels.rootsRemove, id),
    setEnabled: (id, enabled) => ipcRenderer.invoke(IpcChannels.rootsSetEnabled, id, enabled)
  },
  scan: {
    start: () => ipcRenderer.invoke(IpcChannels.scanStart),
    cancel: () => ipcRenderer.invoke(IpcChannels.scanCancel),
    isRunning: () => ipcRenderer.invoke(IpcChannels.scanIsRunning),
    onProgress: (listener) => subscribe(IpcChannels.scanProgress, listener),
    onFinished: (listener) => subscribe(IpcChannels.scanFinished, listener)
  },
  metadata: {
    search: (query, gameId) => ipcRenderer.invoke(IpcChannels.metadataSearch, query, gameId),
    assign: (gameId, source, externalId) => ipcRenderer.invoke(IpcChannels.metadataAssign, gameId, source, externalId),
    clear: (gameId) => ipcRenderer.invoke(IpcChannels.metadataClear, gameId),
    refresh: (gameId) => ipcRenderer.invoke(IpcChannels.metadataRefresh, gameId),
    getProgress: () => ipcRenderer.invoke(IpcChannels.metadataGetProgress),
    onProgress: (listener) => subscribe(IpcChannels.metadataProgress, listener)
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannels.settingsGet),
    setRawgKey: (key) => ipcRenderer.invoke(IpcChannels.settingsSetRawgKey, key),
    setSteamGridDbKey: (key) => ipcRenderer.invoke(IpcChannels.settingsSetSteamGridDbKey, key),
    setSkin: (skin) => ipcRenderer.invoke(IpcChannels.settingsSetSkin, skin),
    setScanMode: (mode) => ipcRenderer.invoke(IpcChannels.settingsSetScanMode, mode)
  },
  updates: {
    get: () => ipcRenderer.invoke(IpcChannels.updatesGet),
    check: () => ipcRenderer.invoke(IpcChannels.updatesCheck),
    download: () => ipcRenderer.invoke(IpcChannels.updatesDownload),
    cancel: () => ipcRenderer.invoke(IpcChannels.updatesCancel),
    install: () => ipcRenderer.invoke(IpcChannels.updatesInstall),
    onStatus: (listener) => subscribe(IpcChannels.updatesStatus, listener)
  },
  profile: {
    get: () => ipcRenderer.invoke(IpcChannels.profileGet),
    save: (name) => ipcRenderer.invoke(IpcChannels.profileSave, name),
    choosePhoto: () => ipcRenderer.invoke(IpcChannels.profileChoosePhoto),
    removePhoto: () => ipcRenderer.invoke(IpcChannels.profileRemovePhoto),
    remove: () => ipcRenderer.invoke(IpcChannels.profileDelete)
  },
  data: {
    export: () => ipcRenderer.invoke(IpcChannels.dataExport),
    import: () => ipcRenderer.invoke(IpcChannels.dataImport),
    importLastBackup: () => ipcRenderer.invoke(IpcChannels.dataImportLastBackup)
  },
  app: {
    state: () => ipcRenderer.invoke(IpcChannels.appState),
    completeOnboarding: () => ipcRenderer.invoke(IpcChannels.appCompleteOnboarding),
    isOnline: () => ipcRenderer.invoke(IpcChannels.appIsOnline),
    resetEverything: () => ipcRenderer.invoke(IpcChannels.appResetEverything)
  },
  window: {
    minimize: () => ipcRenderer.invoke(IpcChannels.windowMinimize),
    toggleFullscreen: () => ipcRenderer.invoke(IpcChannels.windowToggleFullscreen),
    close: () => ipcRenderer.invoke(IpcChannels.windowClose),
    onFullscreenChanged: (listener) => subscribe(IpcChannels.windowFullscreenChanged, listener)
  },
  openExternal: (url) => ipcRenderer.invoke(IpcChannels.openExternal, url)
}

contextBridge.exposeInMainWorld('api', api)
