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
    openFolder: (id) => ipcRenderer.invoke(IpcChannels.libraryOpenFolder, id)
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
  }
}

contextBridge.exposeInMainWorld('api', api)
