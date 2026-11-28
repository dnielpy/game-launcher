/** Where a detected game came from. A game can have several sources. */
/** minecraft: the Minecraft entry, started through SKlauncher or the official launcher. */
export type DetectionSource = 'folder' | 'registry' | 'shortcut' | 'steam' | 'epic' | 'manual' | 'minecraft'

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

/** Consoles whose games Orus can find as files and start through an emulator. */
export type EmulatedPlatform = 'switch'
/** 'pc' for Windows games; the rest are emulated consoles. */
export type GamePlatform = 'pc' | EmulatedPlatform

export type LaunchTarget =
  | { type: 'exe'; exePath: string; args: string; workingDir: string }
  | { type: 'uri'; uri: string }
  /** A console game file, started with the emulator chosen for its platform. */
  | { type: 'rom'; romPath: string; platform: EmulatedPlatform }

export type GameStatus = 'installed' | 'missing' | 'unavailable'

export interface ExecutableCandidate {
  path: string
  score: number
  sizeBytes: number
}

export type MetadataSource = 'steam' | 'rawg' | 'steamgriddb'

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
  /** PC system requirements from the store. Undefined: not looked up yet (older details); null: none published. */
  requirements?: GameRequirements | null
}

/** One line of a requirements list, such as { label: 'Memory', value: '8 GB RAM' }. */
export interface RequirementItem {
  label: string
  value: string
}

export interface GameRequirements {
  minimum: RequirementItem[] | null
  recommended: RequirementItem[] | null
}

export interface HardwareGpu {
  name: string
  vramBytes: number | null
  driver: string | null
}

export interface HardwareMemoryModule {
  capacityBytes: number
  speedMhz: number | null
  manufacturer: string | null
  partNumber: string | null
}

export interface HardwareDisk {
  model: string
  sizeBytes: number
  /** SSD, HDD or null when Windows does not say. */
  mediaType: string | null
  /** NVMe, SATA, USB... */
  busType: string | null
}

/** What is inside this PC, read from Windows. Missing parts are null or empty. */
export interface HardwareInfo {
  cpu: { name: string; cores: number | null; threads: number | null; maxClockMhz: number | null } | null
  gpus: HardwareGpu[]
  memory: { totalBytes: number; modules: HardwareMemoryModule[] }
  motherboard: { manufacturer: string | null; product: string | null } | null
  disks: HardwareDisk[]
  os: string | null
  collectedAt: string
}

export interface DayPlaytime {
  /** Local date, YYYY-MM-DD. */
  date: string
  seconds: number
  /** The game played the longest that day, or null when nothing was played. */
  topGameId: number | null
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
  platform: GamePlatform
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
export type ManualField = 'title' | 'exe' | 'args' | 'category' | 'match' | 'location'

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

export type SkinId = 'orus' | 'cinema' | 'mosaic'

/** auto: Orus looks all over the PC. manual: only in the folders the user chose. */
export type ScanMode = 'auto' | 'manual'

export interface SettingsState {
  hasRawgKey: boolean
  hasSteamGridDbKey: boolean
  skin: SkinId
  scanMode: ScanMode
}

export interface AppState {
  /** The welcome screens were completed (or skipped because a library already existed). */
  onboardingDone: boolean
  fullscreen: boolean
  /** A backup made when everything was reset, offered on the welcome screen. */
  lastBackupPath: string | null
}

/** A folder (or file) the scan never looks at. */
export interface ExcludedPath {
  id: number
  path: string
  /** Name of the game that was removed, when the exclusion came from removing it. */
  label: string | null
  addedAt: string
}

export interface EmulationPlatformState {
  platform: EmulatedPlatform
  enabled: boolean
  /** Emulator chosen by the user (a game id in the Emulators section); null picks one automatically. */
  emulatorId: number | null
  /** The emulator that will be used right now, after the automatic pick. */
  resolvedEmulatorId: number | null
  gameCount: number
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

export type UpdateState = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'paused' | 'downloaded' | 'installing' | 'error'

export interface UpdateStatus {
  state: UpdateState
  currentVersion: string
  latest: { version: string; notes: string | null; publishedAt: string | null; sizeBytes: number } | null
  download: { receivedBytes: number; totalBytes: number; bytesPerSecond: number } | null
  error: string | null
  checkedAt: string | null
}

/** The local profile. It never leaves this PC; there is no account. */
export interface ProfileState {
  /** True once the user chose a name. */
  created: boolean
  name: string
  /** Image file inside the profile folder, served as media://profile/<file>. */
  avatarFile: string | null
}

export interface ExportSummary {
  filePath: string
  games: number
  sessions: number
  images: number
  sizeBytes: number
}

export interface ImportSummary {
  gamesAdded: number
  gamesMerged: number
  sessionsAdded: number
  imagesRestored: number
  profileRestored: boolean
  exportedAt: string | null
}
