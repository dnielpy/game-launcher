import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { DetectionSource, RootCategory, ScanProgress } from '@shared/types'
import { analyzeLayout, classifyFolder, sizeBonus, type Classification } from './folderClassifier'
import { inspectFolder, type FolderInspection } from './folderInspector'
import { pickExecutable, workingDirFor } from './executablePicker'
import { isExcludedFolderName } from './exclusions'
import { directorySize, isDirectory, isSameOrInside, pathKey, readDirSafe, realPathSafe, withTimeout } from './fsUtils'
import { cleanDisplayTitle, cleanSearchTitle, normalizeForComparison } from './nameCleaner'
import { matchTool } from './toolCatalog'
import { readEpicLibrary } from './sources/epic'
import { readUninstallEntries } from './sources/registry'
import { readSteamLibrary } from './sources/steam'
import type {
  InstallerCandidate,
  LauncherEntry,
  RegistryEntry,
  ResolvedShortcut,
  ScanCache,
  ScanCandidate,
  ScanError,
  ScanInput,
  ScanOutput,
  ScanRoot
} from './types'

/** How many folder levels below a root are searched for game folders. */
const MAX_WALK_DEPTH = 3
/** Scores this close to the threshold are worth measuring the folder size for. */
const SIZE_CHECK_MARGIN = 30
/** Folder names that never make a good title; the parent folder name is used instead. */
const GENERIC_FOLDER_NAMES = /^(game|games|bin|bin64|binaries|win64|win32|x64|x86|app|content|release|retail|data)$/i

export interface ScanDependencies {
  readRegistry: () => Promise<RegistryEntry[]>
  readSteam: () => Promise<LauncherEntry[]>
  readEpic: () => Promise<LauncherEntry[]>
}

export const defaultDependencies: ScanDependencies = {
  readRegistry: readUninstallEntries,
  readSteam: () => readSteamLibrary(),
  readEpic: () => readEpicLibrary()
}

export class ScanCancelledError extends Error {
  constructor() {
    super('Scan cancelled')
    this.name = 'ScanCancelledError'
  }
}

interface EvaluationContext {
  category: RootCategory
  directChildOfRoot: boolean
  externalBonus: number
  extraSources: DetectionSource[]
}

export class ScanEngine {
  private readonly games = new Map<string, ScanCandidate>()
  private readonly installers = new Map<string, InstallerCandidate>()
  private readonly errors: ScanError[] = []
  private readonly visitedRealPaths = new Set<string>()
  private readonly nextCache: ScanCache = {}
  private registryByPath = new Map<string, RegistryEntry>()
  private shortcutTargets: string[] = []
  private foldersVisited = 0
  private lastProgressAt = 0
  private rootIndex = 0
  private rootProgress = 0

  constructor(
    private readonly input: ScanInput,
    private readonly onProgress: (progress: ScanProgress) => void = () => {},
    private readonly signal?: AbortSignal,
    private readonly deps: ScanDependencies = defaultDependencies
  ) {}

  async run(): Promise<ScanOutput> {
    this.report('preparing', 'Preparing scan', true)

    this.report('sources', 'Reading installed programs and shortcuts', true)
    const registryEntries = this.input.includeRegistry ? await this.safe('registry', this.deps.readRegistry, []) : []
    const launcherEntries = this.input.includeLaunchers
      ? [...(await this.safe('steam', this.deps.readSteam, [])), ...(await this.safe('epic', this.deps.readEpic, []))]
      : []

    this.registryByPath = new Map(registryEntries.map((entry) => [pathKey(entry.installLocation), entry]))
    this.shortcutTargets = this.input.shortcuts
      .map((shortcut) => shortcut.targetPath)
      .filter((target) => /\.exe$/i.test(target))

    const reachableRoots: string[] = []
    for (const [index, root] of this.input.roots.entries()) {
      this.throwIfCancelled()
      this.rootIndex = index
      this.rootProgress = 0
      if (!(await isDirectory(root.path))) {
        this.errors.push({ path: root.path, message: 'Location is not reachable' })
        continue
      }
      reachableRoots.push(root.path)
      this.report('folders', `Scanning ${root.path}`, true, root.path)
      await this.scanRoot(root)
    }

    this.report('executables', 'Checking games from installed programs', true)
    await this.scanRegistryLocations(registryEntries)
    await this.scanShortcutTargets(this.input.shortcuts)
    await this.addLauncherEntries(launcherEntries)

    const games = mergeDuplicates(this.collapseNested([...this.games.values()])).map(applyToolCatalog)
    this.report('done', `Found ${games.length} games`, true)

    return {
      games,
      installers: [...this.installers.values()],
      errors: this.errors,
      cache: this.nextCache,
      reachableRoots,
      foldersVisited: this.foldersVisited
    }
  }

  // ---------------------------------------------------------------- walking

  private async scanRoot(root: ScanRoot): Promise<void> {
    // A user location can itself be a single game folder.
    if (root.category === 'games') {
      const rootResult = await this.inspectAndClassify(root.path, {
        category: 'games',
        directChildOfRoot: false,
        externalBonus: 0,
        extraSources: []
      })
      if (
        rootResult &&
        rootResult.classification.kind === 'game' &&
        analyzeLayout(rootResult.inspection, rootResult.classification.engine).type === 'single' &&
        (rootResult.inspection.executables.some((exe) => exe.depth === 0) || rootResult.classification.engine !== 'unknown')
      ) {
        await this.acceptGame(root.path, rootResult.inspection, rootResult.classification, [])
        return
      }
    }
    await this.walk(root.path, 0, root.category)
  }

  private async walk(dir: string, depth: number, category: RootCategory): Promise<void> {
    this.throwIfCancelled()
    let entries
    try {
      entries = await readDirSafe(dir)
    } catch (error) {
      this.errors.push({ path: dir, message: errorMessage(error) })
      return
    }

    for (const [index, entry] of entries.entries()) {
      this.throwIfCancelled()
      if (depth === 0) this.rootProgress = index / Math.max(1, entries.length)
      if (!entry.isDirectory() || isExcludedFolderName(entry.name)) continue
      const child = path.join(dir, entry.name)

      const realPath = pathKey(await realPathSafe(child))
      if (this.visitedRealPaths.has(realPath)) continue
      this.visitedRealPaths.add(realPath)

      // Inside a games location every container level keeps the "games folder" bonus,
      // so D:\Games\RPG\<game> scores like D:\Games\<game>.
      const result = await this.inspectAndClassify(child, {
        category,
        directChildOfRoot: true,
        externalBonus: 0,
        extraSources: []
      })
      if (!result) continue
      const { inspection, classification } = result
      const canDescend = depth + 1 < MAX_WALK_DEPTH

      if (classification.kind === 'installer' || classification.kind === 'update') {
        await this.acceptInstaller(child, classification.kind)
      } else if (classification.kind === 'game') {
        const layout = analyzeLayout(inspection, classification.engine)
        if (layout.type !== 'single' && canDescend) {
          // A collection folder or a doubled folder (Foo/Foo/foo.exe): the games are one level down.
          await this.walk(child, depth + 1, category)
        } else {
          await this.acceptGame(child, inspection, classification, [])
        }
      } else if (!classification.hasExecutables && canDescend) {
        await this.walk(child, depth + 1, category)
      } else if (classification.hasExecutables && canDescend && category === 'games') {
        // Low score with executables in subfolders only: may still be a container of small games.
        const layout = analyzeLayout(inspection, classification.engine)
        if (layout.type !== 'single') await this.walk(child, depth + 1, category)
      }
    }
  }

  private async inspectAndClassify(
    folder: string,
    context: EvaluationContext
  ): Promise<{ inspection: FolderInspection; classification: Classification } | null> {
    this.foldersVisited++
    this.report('folders', 'Looking through folders', false, folder)
    let inspection: FolderInspection
    try {
      inspection = await inspectFolder(folder, { maxDirectories: context.category === 'noisy' ? 150 : 400 })
    } catch (error) {
      this.errors.push({ path: folder, message: errorMessage(error) })
      return null
    }

    const registry = this.registryByPath.get(pathKey(folder))
    const hasShortcut = this.shortcutTargets.some((target) => isSameOrInside(target, folder))
    const bonus = context.externalBonus + (registry && !context.extraSources.includes('registry') ? 10 : 0) + (hasShortcut && !context.extraSources.includes('shortcut') ? 10 : 0)

    let classification = classifyFolder(inspection, {
      category: context.category,
      directChildOfRoot: context.directChildOfRoot,
      externalBonus: bonus
    })

    // Borderline folders get a second look with their size on disk.
    if (classification.kind === 'none' && classification.hasExecutables && classification.score >= classification.threshold - SIZE_CHECK_MARGIN) {
      const size = await this.folderSize(folder)
      const bonusPoints = sizeBonus(size)
      if (bonusPoints > 0) {
        const score = classification.score + bonusPoints
        classification = {
          ...classification,
          score,
          signals: [...classification.signals, { id: 'size', points: bonusPoints }],
          kind: score >= classification.threshold ? 'game' : 'none'
        }
      }
    }

    return { inspection, classification }
  }

  // ---------------------------------------------------------------- accepting

  private async acceptGame(
    folder: string,
    inspection: FolderInspection,
    classification: Classification,
    extraSources: DetectionSource[]
  ): Promise<void> {
    const key = pathKey(folder)
    const existing = this.games.get(key)
    if (existing) {
      existing.sources = mergeSources(existing.sources, extraSources)
      return
    }

    const registry = this.registryByPath.get(key)
    const shortcutTargets = this.shortcutTargets.filter((target) => isSameOrInside(target, folder))
    const folderName = titleFolderName(folder)
    const rawTitle = registry?.displayName ?? folderName
    const title = cleanDisplayTitle(rawTitle)

    const pick = pickExecutable(inspection.executables, {
      title,
      folderName,
      engine: classification.engine,
      shortcutTargets,
      registryIcon: registry?.displayIcon ?? undefined
    })

    const shortcut = pick.best ? this.input.shortcuts.find((item) => pathKey(item.targetPath) === pathKey(pick.best!.path)) : undefined

    const sources: DetectionSource[] = ['folder']
    if (registry) sources.push('registry')
    if (shortcutTargets.length > 0) sources.push('shortcut')

    const confidenceBase = Math.round((classification.score / classification.threshold) * 50)
    const confidence = Math.max(0, Math.min(100, confidenceBase + (pick.anchored ? 20 : 0) - (pick.ambiguous ? 15 : 0)))

    this.games.set(key, {
      installPath: folder,
      folderName: path.basename(folder),
      title,
      searchTitle: cleanSearchTitle(rawTitle),
      sources: mergeSources(sources, extraSources),
      category: 'game',
      engine: classification.engine,
      confidence,
      needsReview: pick.ambiguous || pick.best === null,
      launch: pick.best
        ? {
            type: 'exe',
            exePath: pick.best.path,
            args: shortcut?.args ?? '',
            workingDir: shortcut?.workingDir || workingDirFor(pick.best.path)
          }
        : null,
      exeCandidates: pick.candidates,
      sizeBytes: await this.folderSize(folder)
    })
    this.report('folders', `Found ${title}`, false, folder)
  }

  private async acceptInstaller(folder: string, kind: InstallerCandidate['kind']): Promise<void> {
    const key = pathKey(folder)
    if (this.installers.has(key)) return
    this.installers.set(key, {
      kind,
      path: folder,
      title: cleanDisplayTitle(path.basename(folder)),
      sizeBytes: await this.folderSize(folder)
    })
  }

  // ---------------------------------------------------------------- other sources

  /** Install folders from the uninstall registry that the folder walk did not reach. */
  private async scanRegistryLocations(entries: RegistryEntry[]): Promise<void> {
    for (const entry of entries) {
      this.throwIfCancelled()
      const folder = entry.installLocation
      if (this.isCovered(folder) || hasExcludedSegment(folder)) continue
      if (!(await isDirectory(folder))) continue
      const result = await this.inspectAndClassify(folder, {
        category: 'noisy',
        directChildOfRoot: false,
        externalBonus: 10,
        extraSources: ['registry']
      })
      if (result?.classification.kind === 'game') {
        await this.acceptGame(folder, result.inspection, result.classification, ['registry'])
      }
    }
  }

  /** Desktop and Start menu shortcuts that point to games outside every library location. */
  private async scanShortcutTargets(shortcuts: ResolvedShortcut[]): Promise<void> {
    const handled = new Set<string>()
    for (const shortcut of shortcuts) {
      this.throwIfCancelled()
      const target = shortcut.targetPath
      if (!/\.exe$/i.test(target) || this.isCovered(target) || hasExcludedSegment(target)) continue

      const folder = await gameFolderForExe(target)
      if (!folder) continue
      const key = pathKey(folder)
      if (handled.has(key) || this.isCovered(folder) || !(await isDirectory(folder))) continue
      handled.add(key)
      const result = await this.inspectAndClassify(folder, {
        category: 'noisy',
        directChildOfRoot: false,
        externalBonus: 10,
        extraSources: ['shortcut']
      })
      if (result?.classification.kind === 'game') {
        await this.acceptGame(folder, result.inspection, result.classification, ['shortcut'])
      }
    }
  }

  private async addLauncherEntries(entries: LauncherEntry[]): Promise<void> {
    for (const entry of entries) {
      this.throwIfCancelled()
      const key = pathKey(entry.installPath)
      const existing = this.games.get(key)
      if (existing) {
        existing.sources = mergeSources(existing.sources, [entry.source])
        existing.launch = entry.launch
        existing.title = cleanDisplayTitle(entry.title)
        existing.searchTitle = cleanSearchTitle(entry.title)
        existing.needsReview = false
        existing.confidence = 100
        continue
      }
      if (!(await isDirectory(entry.installPath))) continue

      let inspection: FolderInspection | null = null
      try {
        inspection = await inspectFolder(entry.installPath, { maxDepth: 3, maxDirectories: 200 })
      } catch {
        inspection = null
      }
      const title = cleanDisplayTitle(entry.title)
      const pick = inspection
        ? pickExecutable(inspection.executables, {
            title,
            folderName: path.basename(entry.installPath),
            engine: 'unknown',
            shortcutTargets: []
          })
        : null

      this.games.set(key, {
        installPath: entry.installPath,
        folderName: path.basename(entry.installPath),
        title,
        searchTitle: cleanSearchTitle(entry.title),
        sources: [entry.source],
        category: 'game',
        engine: inspection ? classifyFolder(inspection, { category: 'games', directChildOfRoot: false }).engine : 'unknown',
        confidence: 100,
        needsReview: false,
        launch: entry.launch,
        exeCandidates: pick?.candidates ?? [],
        sizeBytes: await this.folderSize(entry.installPath)
      })
    }
  }

  // ---------------------------------------------------------------- helpers

  /** Merges a game nested inside another game (for example a registry entry pointing at a subfolder). */
  private collapseNested(games: ScanCandidate[]): ScanCandidate[] {
    const sorted = [...games].sort((a, b) => pathKey(a.installPath).length - pathKey(b.installPath).length)
    const kept: ScanCandidate[] = []
    for (const game of sorted) {
      const parent = kept.find((outer) => isSameOrInside(game.installPath, outer.installPath))
      if (parent) {
        parent.sources = mergeSources(parent.sources, game.sources)
        if (game.launch?.type === 'uri' && parent.launch?.type !== 'uri') parent.launch = game.launch
        continue
      }
      kept.push(game)
    }
    return kept.sort((a, b) => a.title.localeCompare(b.title))
  }

  private isCovered(target: string): boolean {
    for (const game of this.games.values()) if (isSameOrInside(target, game.installPath)) return true
    return false
  }

  private async folderSize(folder: string): Promise<number> {
    const key = pathKey(folder)
    const cached = this.nextCache[key]
    if (cached) return cached.sizeBytes

    const signature = await folderSignature(folder)
    const previous = this.input.cache[key]
    let sizeBytes: number
    if (previous && signature && previous.signature === signature) {
      sizeBytes = previous.sizeBytes
    } else {
      sizeBytes = await directorySize(folder)
    }
    if (signature) this.nextCache[key] = { signature, sizeBytes }
    return sizeBytes
  }

  private async safe<T>(label: string, task: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await task()
    } catch (error) {
      this.errors.push({ path: label, message: errorMessage(error) })
      return fallback
    }
  }

  private throwIfCancelled(): void {
    if (this.signal?.aborted) throw new ScanCancelledError()
  }

  /**
   * Overall progress between 0 and 1. Walking the library locations is most of the work,
   * so it covers 5% to 85%, split evenly between locations and, inside one, between its folders.
   */
  private fraction(phase: ScanProgress['phase']): number {
    switch (phase) {
      case 'preparing':
        return 0
      case 'sources':
        return 0.03
      case 'folders': {
        const roots = Math.max(1, this.input.roots.length)
        const withinRoot = Math.min(1, Math.max(0, this.rootProgress))
        return 0.05 + 0.8 * Math.min(1, (this.rootIndex + withinRoot) / roots)
      }
      case 'executables':
        return 0.88
      default:
        return 1
    }
  }

  private report(phase: ScanProgress['phase'], message: string, force = false, currentPath: string | null = null): void {
    const now = Date.now()
    if (!force && now - this.lastProgressAt < 100) return
    this.lastProgressAt = now
    this.onProgress({
      phase,
      message,
      currentPath,
      fraction: this.fraction(phase),
      foldersVisited: this.foldersVisited,
      gamesFound: this.games.size
    })
  }
}

// ------------------------------------------------------------------ free functions

/** Launchers, emulators and utilities are tools: they get their proper name and leave the game library. */
function applyToolCatalog(game: ScanCandidate): ScanCandidate {
  const exePath = game.launch?.type === 'exe' ? game.launch.exePath : (game.exeCandidates[0]?.path ?? null)
  const tool = matchTool(game.title, game.folderName, exePath)
  if (!tool) return game
  return { ...game, category: 'tool', title: tool.name, searchTitle: tool.name, needsReview: false }
}

function parentKey(target: string): string {
  return pathKey(isWindowsPath(target) ? path.win32.dirname(target) : path.dirname(target))
}

/**
 * The same game found several times next to each other ("Forza Horizon 6 MULTi23",
 * "Forza Horizon 6 364.933"...) is one game. Keeps the copy that looks most like the
 * real install: launcher entries first, then the biggest folder.
 */
export function mergeDuplicates(games: ScanCandidate[]): ScanCandidate[] {
  const groups = new Map<string, ScanCandidate[]>()
  for (const game of games) {
    const key = `${parentKey(game.installPath)}|${normalizeForComparison(game.searchTitle)}`
    const group = groups.get(key)
    if (group) group.push(game)
    else groups.set(key, [game])
  }

  const kept: ScanCandidate[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      kept.push(group[0]!)
      continue
    }
    const ranked = [...group].sort((a, b) => {
      const launcherA = a.launch?.type === 'uri' ? 1 : 0
      const launcherB = b.launch?.type === 'uri' ? 1 : 0
      return launcherB - launcherA || b.sizeBytes - a.sizeBytes || b.confidence - a.confidence
    })
    const best = ranked[0]!
    for (const other of ranked.slice(1)) best.sources = mergeSources(best.sources, other.sources)
    kept.push(best)
  }
  return kept.sort((a, b) => a.title.localeCompare(b.title))
}

function mergeSources(a: DetectionSource[], b: DetectionSource[]): DetectionSource[] {
  return [...new Set([...a, ...b])]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function titleFolderName(folder: string): string {
  const name = path.basename(folder)
  if (GENERIC_FOLDER_NAMES.test(name)) {
    const parent = path.basename(path.dirname(folder))
    if (parent) return parent
  }
  return name
}

function splitSegments(target: string): string[] {
  return target.split(/[\\/]+/).filter((segment) => segment.length > 0)
}

function hasExcludedSegment(target: string): boolean {
  return splitSegments(target).some((segment) => isExcludedFolderName(segment))
}

/** Folders that only hold a game's binaries. A shortcut into one of them belongs to the folder above. */
const BINARY_DIR_NAMES = /^(bin|bin32|bin64|bin_x64|bin_x86|binaries|x64|x86|x64_dx12|win64|win32|wingdk|retail|release|shipping|game|launcher)$/i
/** Folders that are never a game themselves: stop climbing there. */
const STOP_FOLDER_NAMES = /^(program files|program files \(x86\)|games|juegos|jogos|steamapps|common|users|desktop|downloads|documents)$/i

/**
 * Finds the game folder for an executable by climbing out of binary folders:
 *   D:\Foo\bin\x64\foo.exe                         -> D:\Foo
 *   D:\Foo\Project\Binaries\Win64\x-Shipping.exe  -> D:\Foo (when D:\Foo\Engine exists)
 */
export async function gameFolderForExe(exePath: string, exists: (target: string) => Promise<boolean> = isDirectory): Promise<string | null> {
  let current = pathDirname(exePath)
  for (let i = 0; i < 4; i++) {
    const name = pathBasename(current)
    if (!BINARY_DIR_NAMES.test(name)) break
    const parent = pathDirname(current)
    if (parent === current) break
    current = parent
  }

  // Unreal layout: <Game>\<Project>\Binaries\Win64. The game root is the folder that holds Engine.
  const parent = pathDirname(current)
  if (parent !== current && (await exists(pathJoin(parent, 'Engine')))) current = parent

  const name = pathBasename(current)
  if (!name || /^[a-zA-Z]:$/.test(name) || STOP_FOLDER_NAMES.test(name)) return null
  return current
}

function isWindowsPath(target: string): boolean {
  return /^[a-zA-Z]:\\/.test(target) || target.includes('\\')
}

function pathJoin(base: string, child: string): string {
  return isWindowsPath(base) ? path.win32.join(base, child) : path.join(base, child)
}

function pathDirname(target: string): string {
  return isWindowsPath(target) ? path.win32.dirname(target) : path.dirname(target)
}

function pathBasename(target: string): string {
  return isWindowsPath(target) ? path.win32.basename(target) : path.basename(target)
}

/**
 * Cheap fingerprint of a folder: its own mtime plus the names and mtimes of its direct children.
 * When it matches the previous scan, the expensive size calculation is reused.
 */
export async function folderSignature(folder: string): Promise<string | null> {
  try {
    const stat = await withTimeout(fs.stat(folder), folder)
    const entries = await readDirSafe(folder)
    const parts = await Promise.all(
      entries.map(async (entry) => {
        try {
          const childStat = await withTimeout(fs.stat(path.join(folder, entry.name)), entry.name, 2000)
          return `${entry.name}:${Math.round(childStat.mtimeMs)}:${entry.isFile() ? childStat.size : 'd'}`
        } catch {
          return `${entry.name}:?`
        }
      })
    )
    parts.sort()
    return `${Math.round(stat.mtimeMs)}|${parts.join('|')}`
  } catch {
    return null
  }
}

export async function runScan(
  input: ScanInput,
  onProgress?: (progress: ScanProgress) => void,
  signal?: AbortSignal,
  deps?: ScanDependencies
): Promise<ScanOutput> {
  return new ScanEngine(input, onProgress, signal, deps).run()
}
