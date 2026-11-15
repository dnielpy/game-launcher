import { BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import { z } from 'zod'
import { IpcChannels } from '@shared/ipc'
import type { GamePatch, ManualField } from '@shared/types'
import type { Repository } from './db/repository'
import { isDirectory } from './scanner/fsUtils'
import { launchGame, openGameFolder } from './services/launcher'
import type { ScanService } from './services/scanService'

const idSchema = z.number().int().positive()
const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    exePath: z.string().min(1).optional(),
    launchArgs: z.string().max(2000).optional(),
    hidden: z.boolean().optional(),
    favorite: z.boolean().optional()
  })
  .strict()

export function registerIpcHandlers(repository: Repository, scanService: ScanService): void {
  ipcMain.handle(IpcChannels.libraryList, () => repository.listGames())

  ipcMain.handle(IpcChannels.libraryUpdate, (_event, rawId: unknown, rawPatch: unknown) => {
    const id = idSchema.parse(rawId)
    const patch: GamePatch = patchSchema.parse(rawPatch)
    const game = repository.getGame(id)
    if (!game) throw new Error('Game not found')

    const manualFields = new Set<ManualField>(game.manualFields)
    let launch = game.launch ?? undefined

    if (patch.title !== undefined) manualFields.add('title')

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
      manualFields: [...manualFields],
      needsReview: patch.exePath !== undefined ? false : undefined
    })
    return repository.getGame(id)
  })

  ipcMain.handle(IpcChannels.libraryLaunch, async (_event, rawId: unknown) => {
    const game = repository.getGame(idSchema.parse(rawId))
    if (!game) throw new Error('Game not found')
    await launchGame(game)
  })

  ipcMain.handle(IpcChannels.libraryOpenFolder, async (_event, rawId: unknown) => {
    const game = repository.getGame(idSchema.parse(rawId))
    if (!game) throw new Error('Game not found')
    await openGameFolder(game)
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

  ipcMain.handle(IpcChannels.scanStart, () => {
    void scanService.start()
  })
  ipcMain.handle(IpcChannels.scanCancel, () => scanService.cancel())
  ipcMain.handle(IpcChannels.scanIsRunning, () => scanService.isRunning)
}
