import type { DetectionSource, EmulatedPlatform, ExecutableCandidate, GameCategory, GameEngine, GamePlatform, LaunchTarget, RootCategory } from '@shared/types'

export interface ScanRoot {
  path: string
  category: RootCategory
}

/** A shortcut already resolved by the main process (needs Electron's shell API). */
export interface ResolvedShortcut {
  shortcutPath: string
  targetPath: string
  args: string
  workingDir: string
}

export interface RegistryEntry {
  displayName: string
  installLocation: string
  displayIcon: string | null
  publisher: string | null
}

export interface LauncherEntry {
  source: Extract<DetectionSource, 'steam' | 'epic'>
  title: string
  installPath: string
  launch: LaunchTarget
}

export interface ScanCandidate {
  installPath: string
  folderName: string
  title: string
  searchTitle: string
  sources: DetectionSource[]
  category: GameCategory
  /** Missing means a Windows game. */
  platform?: GamePlatform
  engine: GameEngine
  confidence: number
  needsReview: boolean
  launch: LaunchTarget | null
  exeCandidates: ExecutableCandidate[]
  sizeBytes: number
}

export interface InstallerCandidate {
  kind: 'installer' | 'update'
  path: string
  title: string
  sizeBytes: number
}

export interface ScanCacheEntry {
  signature: string
  sizeBytes: number
}

export type ScanCache = Record<string, ScanCacheEntry>

export interface ScanInput {
  roots: ScanRoot[]
  shortcuts: ResolvedShortcut[]
  includeRegistry: boolean
  includeLaunchers: boolean
  cache: ScanCache
  /** Folders that are never games, such as the launcher's own install folder. */
  excludePaths?: string[]
  /** Consoles whose game files are searched for (Switch .nsp) under the game roots and romDirs. */
  romPlatforms?: EmulatedPlatform[]
  /** Extra folders with console games, read from the emulators' own settings. */
  romDirs?: string[]
}

export interface ScanError {
  path: string
  message: string
}

export interface ScanOutput {
  games: ScanCandidate[]
  installers: InstallerCandidate[]
  errors: ScanError[]
  cache: ScanCache
  /** Roots that could be read. Games under unreachable roots must not be marked missing. */
  reachableRoots: string[]
  foldersVisited: number
}
