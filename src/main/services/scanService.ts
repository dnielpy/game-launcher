import { utilityProcess, type UtilityProcess } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { LibraryRoot, ScanProgress, ScanSummary } from '@shared/types'
import type { Repository } from '../db/repository'
import { log } from '../logger'
import { isSameOrInside, pathExists } from '../scanner/fsUtils'
import { reconcile } from '../scanner/reconcile'
import { discoverDefaultRoots } from '../scanner/sources/defaultRoots'
import type { ScanInput, ScanOutput } from '../scanner/types'
import type { WorkerRequest, WorkerResponse } from '../scanner/worker/protocol'
import { extractIcon } from './icons'
import { readShortcuts } from './shortcuts'

export interface ScanEvents {
  onProgress: (progress: ScanProgress) => void
  onFinished: (result: { summary: ScanSummary | null; error: string | null }) => void
  /** Called after the library was saved, before icons; starts the metadata lookups. */
  onSaved: () => void
}

export class ScanService {
  private worker: UtilityProcess | null = null

  constructor(
    private readonly repository: Repository,
    private readonly workerPath: string,
    private readonly events: ScanEvents
  ) {}

  get isRunning(): boolean {
    return this.worker !== null
  }

  /** Registers default locations that exist on this PC. Locations the user disabled stay disabled. */
  async syncDefaultRoots(): Promise<void> {
    const roots = await discoverDefaultRoots()
    for (const root of roots) this.repository.upsertRoot(root.path, 'auto', root.category)
  }

  async listRoots(): Promise<LibraryRoot[]> {
    const roots = this.repository.listRoots()
    return Promise.all(roots.map(async (root) => ({ ...root, available: await pathExists(root.path) })))
  }

  async start(): Promise<void> {
    if (this.worker) return
    const startedAt = Date.now()
    this.events.onProgress({ phase: 'preparing', message: 'Looking for game locations', currentPath: null, fraction: 0, foldersVisited: 0, gamesFound: 0 })

    try {
      await this.syncDefaultRoots()
      const input: ScanInput = {
        roots: this.repository
          .listRoots()
          .filter((root) => root.enabled)
          .map((root) => ({ path: root.path, category: root.category })),
        shortcuts: await readShortcuts(),
        includeRegistry: true,
        includeLaunchers: true,
        cache: this.repository.loadScanCache()
      }
      const output = await this.runWorker(input)
      if (!output) {
        this.events.onFinished({ summary: null, error: null })
        return
      }
      const summary = await this.persist(output, startedAt)
      this.events.onFinished({ summary, error: null })
    } catch (error) {
      log.error('Scan failed', error)
      this.events.onFinished({ summary: null, error: error instanceof Error ? error.message : String(error) })
    }
  }

  cancel(): void {
    this.worker?.postMessage({ type: 'cancel' } satisfies WorkerRequest)
  }

  private runWorker(input: ScanInput): Promise<ScanOutput | null> {
    return new Promise((resolve, reject) => {
      const worker = utilityProcess.fork(this.workerPath, [], { serviceName: 'Game scanner' })
      this.worker = worker
      let settled = false
      const finish = (callback: () => void) => {
        if (settled) return
        settled = true
        this.worker = null
        worker.kill()
        callback()
      }

      worker.on('message', (message: WorkerResponse) => {
        switch (message.type) {
          case 'progress':
            this.events.onProgress(message.progress)
            break
          case 'done':
            finish(() => resolve(message.output))
            break
          case 'cancelled':
            finish(() => resolve(null))
            break
          case 'error':
            finish(() => reject(new Error(message.message)))
            break
        }
      })
      worker.on('exit', (code) => {
        finish(() => reject(new Error(`Scanner stopped unexpectedly (exit code ${code})`)))
      })
      worker.postMessage({ type: 'start', input } satisfies WorkerRequest)
    })
  }

  private async persist(output: ScanOutput, startedAt: number): Promise<ScanSummary> {
    this.events.onProgress({
      phase: 'saving',
      message: 'Saving your library',
      currentPath: null,
      fraction: 0.95,
      foldersVisited: output.foldersVisited,
      gamesFound: output.games.length
    })

    const reachableDrives = new Set<string>()
    const isLocationReachable = (installPath: string): boolean => {
      if (output.reachableRoots.some((root) => isSameOrInside(installPath, root))) return true
      const drive = path.parse(installPath).root.toLowerCase()
      if (!drive) return false
      if (!reachableDrives.has(drive) && existsSync(drive)) reachableDrives.add(drive)
      return reachableDrives.has(drive)
    }

    const plan = reconcile(this.repository.storedGamesForReconcile(), output.games, isLocationReachable)
    const newIds: number[] = []

    // A game whose folder is still on disk but that the scanner no longer accepts (an update
    // package, a duplicate copy, an older bad detection) is removed, unless it has history.
    const gamesById = new Map(this.repository.listGames().map((game) => [game.id, game]))
    const rejected = plan.missing.filter((id) => {
      const game = gamesById.get(id)
      return game !== undefined && game.playtimeSeconds === 0 && game.manualFields.length === 0 && !game.favorite && existsSync(game.installPath)
    })
    const missing = plan.missing.filter((id) => !rejected.includes(id))

    this.repository.transaction(() => {
      for (const candidate of plan.inserts) newIds.push(this.repository.insertGame(candidate))
      for (const { id, candidate } of [...plan.updates, ...plan.relinks]) this.repository.applyScanResult(id, candidate)
      this.repository.deleteGames(rejected)
      this.repository.setStatus(missing, 'missing')
      this.repository.setStatus(plan.unavailable, 'unavailable')
      this.repository.replaceInstallers(output.installers)
      this.repository.saveScanCache(output.cache)
      this.repository.markRootsScanned(output.reachableRoots)
    })

    this.events.onSaved()
    await this.extractMissingIcons(newIds)

    for (const error of output.errors) log.warn(`Scan issue at ${error.path}: ${error.message}`)

    return {
      added: plan.inserts.length,
      updated: plan.updates.length,
      relinked: plan.relinks.length,
      missing: missing.length,
      installers: output.installers.length,
      errors: output.errors.length,
      durationMs: Date.now() - startedAt
    }
  }

  /** Icons for new games, plus any older game that still has none. */
  private async extractMissingIcons(newIds: number[]): Promise<void> {
    const targets = this.repository.listGames().filter((game) => newIds.includes(game.id) || !game.iconPath)
    let done = 0
    for (const game of targets) {
      const exePath = game.launch?.type === 'exe' ? game.launch.exePath : game.exeCandidates[0]?.path
      if (!exePath) continue
      const iconFile = await extractIcon(game.id, exePath)
      if (iconFile) this.repository.setIcon(game.id, iconFile)
      done++
      if (done % 10 === 0) {
        this.events.onProgress({
          phase: 'icons',
          message: `Loading icons (${done}/${targets.length})`,
          currentPath: null,
          fraction: 0.95 + 0.05 * (done / targets.length),
          foldersVisited: 0,
          gamesFound: targets.length
        })
      }
    }
  }
}
