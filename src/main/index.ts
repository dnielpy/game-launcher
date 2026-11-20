import { app, BrowserWindow, net, shell } from 'electron'
import path from 'node:path'
import { IpcChannels } from '@shared/ipc'
import { BackupService } from './backup/backupService'
import { openDatabase } from './db/database'
import { Repository } from './db/repository'
import { registerIpcHandlers } from './ipc'
import { initLogger, log } from './logger'
import { handleMediaProtocol, registerMediaScheme } from './mediaProtocol'
import { MetadataService } from './metadata/metadataService'
import { gameMediaDirectory, iconsDirectory } from './services/icons'
import { PlaytimeTracker } from './services/playtime'
import { EmulationService } from './services/emulation'
import { HardwareService } from './services/hardware'
import { ProfileService } from './services/profile'
import { ScanService } from './services/scanService'
import { SettingsService } from './services/settings'
import { UpdateService } from './updates/updateService'
import { configureUserData } from './userData'

configureUserData()
registerMediaScheme()

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    // Orus opens full screen, like a console. F11 or the button in the top bar leaves it.
    fullscreen: true,
    show: false,
    backgroundColor: '#101214',
    autoHideMenuBar: true,
    title: 'Orus',
    // Packaged builds take the icon from the executable.
    ...(app.isPackaged ? {} : { icon: path.join(__dirname, '../../resources/icon.png') }),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => window.show())
  window.on('enter-full-screen', () => window.webContents.send(IpcChannels.windowFullscreenChanged, true))
  window.on('leave-full-screen', () => window.webContents.send(IpcChannels.windowFullscreenChanged, false))
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault()
      window.setFullScreen(!window.isFullScreen())
    }
  })

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
    log.info(`Starting Orus ${app.getVersion()}`)

    const db = openDatabase(path.join(app.getPath('userData'), 'library.db'))
    const repository = new Repository(db)
    const settings = new SettingsService(repository)
    const emulation = new EmulationService(repository)
    const hardware = new HardwareService(repository)
    // Read the parts in the background so My hardware and the requirement checks are ready when opened.
    setTimeout(() => void hardware.get(), 5000)

    // Many games change at once while covers download; the renderer refreshes at most a few times a second.
    let changeTimer: NodeJS.Timeout | null = null
    const notifyLibraryChanged = () => {
      if (changeTimer) return
      changeTimer = setTimeout(() => {
        changeTimer = null
        send(IpcChannels.libraryChanged, { runningGameIds: playtime.runningGameIds() })
      }, 400)
    }

    const playtime = new PlaytimeTracker(repository, () => notifyLibraryChanged())
    const metadata = new MetadataService({
      repository,
      mediaDirectory: gameMediaDirectory(),
      fetch: (url, init) => net.fetch(url, { headers: { 'User-Agent': `GameLauncher/${app.getVersion()}`, ...init?.headers } }),
      getRawgKey: () => settings.getRawgKey(),
      getSteamGridDbKey: () => settings.getSteamGridDbKey(),
      onProgress: (progress) => send(IpcChannels.metadataProgress, progress),
      onGameChanged: notifyLibraryChanged
    })
    const scanService = new ScanService(
      repository,
      path.join(__dirname, 'scanWorker.js'),
      {
        onProgress: (progress) => send(IpcChannels.scanProgress, progress),
        onFinished: (result) => send(IpcChannels.scanFinished, result),
        onSaved: () => void metadata.runPending()
      },
      emulation,
      () => settings.getScanMode()
    )

    const profile = new ProfileService(repository, path.join(app.getPath('userData'), 'profile'))
    const backup = new BackupService(repository, profile, { games: gameMediaDirectory(), icons: iconsDirectory() }, app.getVersion())
    const updates = new UpdateService((status) => send(IpcChannels.updatesStatus, status))

    handleMediaProtocol({ icons: iconsDirectory(), games: gameMediaDirectory(), profile: profile.directory })
    registerIpcHandlers({ repository, scanService, metadata, playtime, settings, updates, profile, backup, emulation, hardware, notifyLibraryChanged })
    updates.startSchedule()
    mainWindow = createWindow()

    // People who used Orus before the welcome screens existed skip them.
    if (repository.getSetting('onboardingDone') === null && (repository.listGames().length > 0 || profile.get().created)) {
      repository.setSetting('onboardingDone', '1')
    }

    // Every start rescans (fast after the first time, thanks to the cache) and fills in missing covers.
    // On the very first start the welcome screens start the scan instead, once the user chose how.
    mainWindow.webContents.once('did-finish-load', () => {
      if (repository.getSetting('onboardingDone') === '1') void scanService.start()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })

    app.on('before-quit', () => {
      scanService.cancel()
      playtime.stop()
      updates.stop()
    })

    app.on('will-quit', () => db.close())
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
