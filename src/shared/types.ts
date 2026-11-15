/** Where a detected game came from. A game can have several sources. */
export type DetectionSource = 'folder' | 'registry' | 'shortcut' | 'steam' | 'epic'

/** Game engine inferred from files on disk. */
export type GameEngine = 'unity' | 'unreal' | 'gamemaker' | 'godot' | 'rpgmaker' | 'unknown'

/** How a library root should be treated by the classifier. */
export type RootCategory = 'games' | 'noisy'

export type RootKind = 'auto' | 'user'

export interface LibraryRoot {
  id: number
  path: string
  kind: RootKind
  category: RootCategory
  enabled: boolean
  available: boolean
  lastScannedAt: string | null
}

export type LaunchTarget =
  | { type: 'exe'; exePath: string; args: string; workingDir: string }
  | { type: 'uri'; uri: string }

export type GameStatus = 'installed' | 'missing' | 'unavailable'

export interface ExecutableCandidate {
  path: string
  score: number
  sizeBytes: number
}

export interface Game {
  id: number
  installPath: string
  folderName: string
  title: string
  searchTitle: string
  launch: LaunchTarget | null
  sources: DetectionSource[]
  engine: GameEngine
  confidence: number
  needsReview: boolean
  exeCandidates: ExecutableCandidate[]
  sizeBytes: number
  status: GameStatus
  hidden: boolean
  favorite: boolean
  iconPath: string | null
  manualFields: ManualField[]
  addedAt: string
  updatedAt: string
  lastSeenAt: string
}

/** Fields the user changed by hand. A rescan never overwrites these. */
export type ManualField = 'title' | 'exe' | 'args'

export interface PendingInstaller {
  id: number
  path: string
  title: string
  sizeBytes: number
  detectedAt: string
}

export type ScanPhase = 'preparing' | 'sources' | 'folders' | 'executables' | 'saving' | 'icons' | 'done'

export interface ScanProgress {
  phase: ScanPhase
  message: string
  foldersVisited: number
  gamesFound: number
}

export interface ScanSummary {
  added: number
  updated: number
  relinked: number
  missing: number
  installers: number
  errors: number
  durationMs: number
}

export interface GamePatch {
  title?: string
  exePath?: string
  launchArgs?: string
  hidden?: boolean
  favorite?: boolean
}
