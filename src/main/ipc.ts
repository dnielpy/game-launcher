import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import { z } from 'zod'
import { IpcChannels } from '@shared/ipc'
import type { GamePatch, ManualField } from '@shared/types'
import type { BackupService } from './backup/backupService'
import type { Repository } from './db/repository'
import type { MetadataService } from './metadata/metadataService'
import { fileSize, isDirectory } from './scanner/fsUtils'
import { cleanDisplayTitle } from './scanner/nameCleaner'
import { matchTool } from './scanner/toolCatalog'
import { extractIcon } from './services/icons'
import { launchGame, openGameFolder } from './services/launcher'
import { planRelocation } from './services/relocate'
import type { PlaytimeTracker } from './services/playtime'
import type { ProfileService } from './services/profile'
import type { ScanService } from './services/scanService'
import type { SettingsService } from './services/settings'
import type { UpdateService } from './updates/updateService'

export interface IpcServices {
  repository: Repository
  scanService: ScanService
  metadata: MetadataService
  playtime: PlaytimeTracker
  settings: SettingsService
  updates: UpdateService
  profile: ProfileService
  backup: BackupService
  notifyLibraryChanged: () => void
}

/** The only e-mail address the app opens, from the About page. */
const CONTACT_EMAIL = 'dnielquesada@gmail.com'

const ALLOWED_EXTERNAL_HOSTS = ['store.steampowered.com', 'rawg.io', 'www.rawg.io', 'github.com']

const idSchema = z.number().int().positive()
const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    exePath: z.string().min(1).optional(),
    launchArgs: z.string().max(2000).optional(),
    hidden: z.boolean().optional(),
    favorite: z.boolean().optional(),
    category: z.enum(['game', 'tool', 'emulator']).optional()
  })
  .strict()

const sourceSchema = z.enum(['steam', 'rawg'])
const externalIdSchema = z.string().regex(/^\d{1,12}$/)

export function registerIpcHandlers(services: IpcServices): void {
  const { repository, scanService, metadata, playtime, settings, updates, profile, backup, notifyLibraryChanged } = services

  ipcMain.handle(IpcChannels.updatesGet, () => updates.getStatus())
  ipcMain.handle(IpcChannels.updatesCheck, () => updates.check())
  ipcMain.handle(IpcChannels.updatesDownload, () => {
    void updates.download()
  })
  ipcMain.handle(IpcChannels.updatesCancel, () => updates.cancel())
  ipcMain.handle(IpcChannels.updatesInstall, () => updates.install())

  ipcMain.handle(IpcChannels.libraryList, () => repository.listGames())

  ipcMain.handle(IpcChannels.libraryUpdate, (_event, rawId: unknown, rawPatch: unknown) => {
    const id = idSchema.parse(rawId)
    const patch: GamePatch = patchSchema.parse(rawPatch)
    const game = repository.getGame(id)
    if (!game) throw new Error('Game not found')

    const manualFields = new Set<ManualField>(game.manualFields)
    let launch = game.launch ?? undefined

    if (patch.title !== undefined) manualFields.add('title')
    if (patch.category !== undefined) manualFields.add('category')

    if (patch.exePath !== undefined) {
      // Only executables the scanner found for this game can be picked, never an arbitrary path.
      const allowed = game.exeCandidates.some((candidate) => candidate.path.toLowerCase() === patch.exePath!.toLowerCase())
      if (!allowed) throw new Error('That executable does not belong to this game')
      launch = {
        type: 'exe',
        exePath: patch.exePath,
        workingDir: path.dirname(patch.exePath),
        args: launch?.type === 'exe' ? launch.args : ''
      }
      manualFields.add('exe')
    }

    if (patch.launchArgs !== undefined) {
      if (launch?.type !== 'exe') throw new Error('Launch options only apply to games started from an executable')
      launch = { ...launch, args: patch.launchArgs }
      manualFields.add('args')
    }

    repository.updateGame(id, {
      title: patch.title,
      launch,
      hidden: patch.hidden,
      favorite: patch.favorite,
      category: patch.category,
      manualFields: [...manualFields],
      needsReview: patch.exePath !== undefined ? false : undefined
    })
    if (patch.category === 'game') void metadata.runPending()
    return repository.getGame(id)
  })

  ipcMain.handle(IpcChannels.libraryLaunch, async (_event, rawId: unknown) => {
    const game = repository.getGame(idSchema.parse(rawId))
    if (!game) throw new Error('Game not found')
    // Watch first: the process list taken here is what "already running before the launch" means.
    await playtime.track(game)
    try {
      await launchGame(game)
    } catch (error) {
      playtime.untrack(game.id)
      throw error
    }
  })

  ipcMain.handle(IpcChannels.libraryOpenFolder, async (_event, rawId: unknown) => {
    const game = repository.getGame(idSchema.parse(rawId))
    if (!game) throw new Error('Game not found')
    await openGameFolder(game)
  })

  ipcMain.handle(IpcChannels.libraryRemove, (_event, rawId: unknown) => {
    const game = repository.getGame(idSchema.parse(rawId))
    if (!game) return
    // Entries with play history are only hidden, so hours and covers are never lost.
    const hasHistory = game.playtimeSeconds > 0 || game.favorite
    if (game.sources.includes('manual') && game.sources.length === 1 && !hasHistory) repository.deleteGames([game.id])
    else repository.updateGame(game.id, { hidden: true })
  })

  ipcMain.handle(IpcChannels.libraryChooseLaunchFile, async (event, rawId: unknown) => {
    const game = repository.getGame(idSchema.parse(rawId))
    if (!game) throw new Error('Game not found')
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: `Choose what starts ${game.title}`,
      defaultPath: game.installPath,
      properties: ['openFile' as const],
      filters: [
        { name: 'Programs and scripts', extensions: ['exe', 'bat', 'cmd', 'lnk', 'url'] },
        { name: 'All files', extensions: ['*'] }
      ]
    }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return null
    repository.setLaunchFile(game.id, filePath, await fileSize(filePath))
    return repository.getGame(game.id)
  })

  ipcMain.handle(IpcChannels.libraryRelocate, async (event, rawId: unknown) => {
    const game = repository.getGame(idSchema.parse(rawId))
    if (!game) throw new Error('Game not found')
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: `Choose the new folder of ${game.title}`,
      defaultPath: path.dirname(game.installPath),
      properties: ['openDirectory' as const]
    }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const folder = result.filePaths[0]
    if (result.canceled || !folder) return null
    repository.relocateGame(game.id, await planRelocation(game, folder))
    const launch = repository.getGame(game.id)?.launch
    if (launch?.type === 'exe') {
      const iconFile = await extractIcon(game.id, launch.exePath)
      if (iconFile) repository.setIcon(game.id, iconFile)
    }
    return repository.getGame(game.id)
  })

  ipcMain.handle(IpcChannels.emulatorsAdd, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Choose the emulator executable',
      properties: ['openFile' as const],
      filters: [{ name: 'Programs', extensions: ['exe'] }]
    }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const exePath = result.filePaths[0]
    if (result.canceled || !exePath || !/\.exe$/i.test(exePath)) return null

    const installPath = path.dirname(exePath)
    const known = matchTool(path.basename(installPath), path.basename(installPath), exePath)
    const title = known?.name ?? cleanDisplayTitle(path.basename(exePath, path.extname(exePath)))
    const id = repository.addManualEntry({ exePath, installPath, title, category: 'emulator', sizeBytes: await fileSize(exePath) })
    const iconFile = await extractIcon(id, exePath)
    if (iconFile) repository.setIcon(id, iconFile)
    return repository.getGame(id)
  })

  ipcMain.handle(IpcChannels.installersList, () => repository.listInstallers())

  ipcMain.handle(IpcChannels.rootsList, () => scanService.listRoots())

  ipcMain.handle(IpcChannels.rootsAdd, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = { title: 'Add a games location', properties: ['openDirectory' as const] }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const selected = result.filePaths[0]
    if (result.canceled || !selected || !(await isDirectory(selected))) return null
    const id = repository.upsertRoot(selected, 'user', 'games')
    repository.setRootEnabled(id, true)
    const roots = await scanService.listRoots()
    return roots.find((root) => root.id === id) ?? null
  })

  ipcMain.handle(IpcChannels.rootsRemove, (_event, rawId: unknown) => {
    repository.removeRoot(idSchema.parse(rawId))
  })

  ipcMain.handle(IpcChannels.rootsSetEnabled, (_event, rawId: unknown, rawEnabled: unknown) => {
    repository.setRootEnabled(idSchema.parse(rawId), z.boolean().parse(rawEnabled))
  })

  ipcMain.handle(IpcChannels.metadataSearch, (_event, rawQuery: unknown) => metadata.search(z.string().max(200).parse(rawQuery)))

  ipcMain.handle(IpcChannels.metadataAssign, async (_event, rawId: unknown, rawSource: unknown, rawExternalId: unknown) => {
    const id = idSchema.parse(rawId)
    await metadata.assign(id, sourceSchema.parse(rawSource), externalIdSchema.parse(rawExternalId))
    return repository.getGame(id)
  })

  ipcMain.handle(IpcChannels.metadataClear, (_event, rawId: unknown) => {
    const id = idSchema.parse(rawId)
    metadata.clear(id)
    return repository.getGame(id)
  })

  ipcMain.handle(IpcChannels.metadataRefresh, async (_event, rawId: unknown) => {
    const id = idSchema.parse(rawId)
    await metadata.refresh(id)
    return repository.getGame(id)
  })

  ipcMain.handle(IpcChannels.metadataGetProgress, () => metadata.getProgress())

  ipcMain.handle(IpcChannels.settingsGet, () => ({ hasRawgKey: settings.getRawgKey() !== null }))

  ipcMain.handle(IpcChannels.settingsSetRawgKey, (_event, rawKey: unknown) => {
    const key = z.string().max(100).nullable().parse(rawKey)
    settings.setRawgKey(key)
    if (key) {
      // Games Steam did not know get a second chance with RAWG.
      repository.resetNotFound()
      void metadata.runPending()
    }
    return { hasRawgKey: settings.getRawgKey() !== null }
  })

  ipcMain.handle(IpcChannels.profileGet, () => profile.get())
  ipcMain.handle(IpcChannels.profileSave, (_event, rawName: unknown) => {
    const name = z.string().trim().min(1).max(40).parse(rawName)
    return profile.setName(name)
  })
  ipcMain.handle(IpcChannels.profileChoosePhoto, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Choose your profile photo',
      properties: ['openFile' as const],
      filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }]
    }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const file = result.filePaths[0]
    if (result.canceled || !file) return null
    return profile.setPhotoFromFile(file)
  })
  ipcMain.handle(IpcChannels.profileRemovePhoto, () => profile.removePhoto())
  ipcMain.handle(IpcChannels.profileDelete, () => profile.remove())

  ipcMain.handle(IpcChannels.dataExport, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Export your Orus data',
      defaultPath: `Orus-data-${new Date().toISOString().slice(0, 10)}.orus`,
      filters: [{ name: 'Orus data', extensions: ['orus'] }]
    }
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    return backup.export(result.filePath)
  })

  ipcMain.handle(IpcChannels.dataImport, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Import Orus data',
      properties: ['openFile' as const],
      filters: [{ name: 'Orus data', extensions: ['orus'] }]
    }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const file = result.filePaths[0]
    if (result.canceled || !file) return null
    const summary = await backup.import(file)
    notifyLibraryChanged()
    // Imported games are checked against this PC: the ones whose folders are here become playable.
    void scanService.start()
    return summary
  })

  ipcMain.handle(IpcChannels.openExternal, async (_event, rawUrl: unknown) => {
    const url = new URL(z.string().url().parse(rawUrl))
    const isContactMail = url.protocol === 'mailto:' && url.pathname === CONTACT_EMAIL
    if (!isContactMail && (url.protocol !== 'https:' || !ALLOWED_EXTERNAL_HOSTS.includes(url.hostname))) throw new Error('That link cannot be opened')
    await shell.openExternal(url.toString())
  })

  ipcMain.handle(IpcChannels.scanStart, () => {
    void scanService.start()
  })
  ipcMain.handle(IpcChannels.scanCancel, () => scanService.cancel())
  ipcMain.handle(IpcChannels.scanIsRunning, () => scanService.isRunning)
}
