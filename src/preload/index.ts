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
    onChanged: (listener) => subscribe(IpcChannels.libraryChanged, listener)
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
    search: (query) => ipcRenderer.invoke(IpcChannels.metadataSearch, query),
    assign: (gameId, source, externalId) => ipcRenderer.invoke(IpcChannels.metadataAssign, gameId, source, externalId),
    clear: (gameId) => ipcRenderer.invoke(IpcChannels.metadataClear, gameId),
    refresh: (gameId) => ipcRenderer.invoke(IpcChannels.metadataRefresh, gameId),
    getProgress: () => ipcRenderer.invoke(IpcChannels.metadataGetProgress),
    onProgress: (listener) => subscribe(IpcChannels.metadataProgress, listener)
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannels.settingsGet),
    setRawgKey: (key) => ipcRenderer.invoke(IpcChannels.settingsSetRawgKey, key)
  },
  openExternal: (url) => ipcRenderer.invoke(IpcChannels.openExternal, url)
}

contextBridge.exposeInMainWorld('api', api)
