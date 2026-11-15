/** Where a detected game came from. A game can have several sources. */
export type DetectionSource = 'folder' | 'registry' | 'shortcut' | 'steam' | 'epic' | 'manual'

/** Game engine inferred from files on disk. */
export type GameEngine = 'unity' | 'unreal' | 'gamemaker' | 'godot' | 'rpgmaker' | 'unknown'

/** Games go to the library, emulators to Emulators, launchers and utilities to Tools. */
export type GameCategory = 'game' | 'tool' | 'emulator'

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

export type MetadataSource = 'steam' | 'rawg'

/** Information about a game downloaded from a public catalog. */
export interface GameMetadata {
  source: MetadataSource
  externalId: string
  name: string
  shortDescription: string | null
  description: string | null
  releaseDate: string | null
  genres: string[]
  developers: string[]
  publishers: string[]
  /** 0 to 100. Share of positive reviews on Steam, or the RAWG rating scaled to 100. */
  rating: number | null
  ratingLabel: string | null
  ratingCount: number | null
  metacritic: number | null
  storeUrl: string | null
  /** Image files cached on disk, served as media://games/<id>/<file>. */
  coverFile: string | null
  heroFile: string | null
  logoFile: string | null
  screenshotFiles: string[]
}

/** pending: not looked up yet. matched: found. not_found: nothing matched. skipped: tools are never looked up. */
export type MetadataStatus = 'pending' | 'matched' | 'not_found' | 'skipped'

export interface Game {
  id: number
  installPath: string
  folderName: string
  title: string
  searchTitle: string
  launch: LaunchTarget | null
  sources: DetectionSource[]
  category: GameCategory
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
  metadata: GameMetadata | null
  metadataStatus: MetadataStatus
  playtimeSeconds: number
  lastPlayedAt: string | null
  sessionCount: number
  addedAt: string
  updatedAt: string
  lastSeenAt: string
}

/** Fields the user changed by hand. A rescan never overwrites these. */
export type ManualField = 'title' | 'exe' | 'args' | 'category' | 'match'

export interface PendingInstaller {
  id: number
  kind: 'installer' | 'update'
  path: string
  title: string
  sizeBytes: number
  detectedAt: string
}

export type ScanPhase = 'preparing' | 'sources' | 'folders' | 'executables' | 'saving' | 'icons' | 'done'

export interface ScanProgress {
  phase: ScanPhase
  message: string
  /** Folder being looked at right now, when there is one. */
  currentPath: string | null
  /** 0 to 1. */
  fraction: number
  foldersVisited: number
  gamesFound: number
}

export interface MetadataProgress {
  running: boolean
  done: number
  total: number
  currentTitle: string | null
}

/** One possible match shown when the user fixes a wrong cover or name. */
export interface MetadataCandidate {
  source: MetadataSource
  externalId: string
  name: string
  imageUrl: string | null
  released: string | null
}

export interface SettingsState {
  hasRawgKey: boolean
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
  category?: GameCategory
}

export type UpdateState = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error'

export interface UpdateStatus {
  state: UpdateState
  currentVersion: string
  latest: { version: string; notes: string | null; publishedAt: string | null; sizeBytes: number } | null
  download: { receivedBytes: number; totalBytes: number; bytesPerSecond: number } | null
  error: string | null
  checkedAt: string | null
}
