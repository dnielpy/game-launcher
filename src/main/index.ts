import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { IpcChannels } from '@shared/ipc'
import { openDatabase } from './db/database'
import { Repository } from './db/repository'
import { registerIpcHandlers } from './ipc'
import { initLogger, log } from './logger'
import { handleMediaProtocol, registerMediaScheme } from './mediaProtocol'
import { ScanService } from './services/scanService'

registerMediaScheme()

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#101214',
    autoHideMenuBar: true,
    title: 'Game Launcher',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => window.show())

  // External links open in the default browser, never inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return window
}

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(async () => {
    initLogger(path.join(app.getPath('userData'), 'logs'))
    log.info(`Starting Game Launcher ${app.getVersion()}`)

    const db = openDatabase(path.join(app.getPath('userData'), 'library.db'))
    const repository = new Repository(db)
    const scanService = new ScanService(repository, path.join(__dirname, 'scanWorker.js'), {
      onProgress: (progress) => send(IpcChannels.scanProgress, progress),
      onFinished: (result) => send(IpcChannels.scanFinished, result)
    })

    handleMediaProtocol()
    registerIpcHandlers(repository, scanService)
    mainWindow = createWindow()

    // First launch: find default locations and scan right away.
    if (repository.getSetting('firstScanDone') !== '1') {
      mainWindow.webContents.once('did-finish-load', () => {
        repository.setSetting('firstScanDone', '1')
        void scanService.start()
      })
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })

    app.on('before-quit', () => {
      scanService.cancel()
      db.close()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
