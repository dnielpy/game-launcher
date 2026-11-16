import type {
  DetectionSource,
  ExecutableCandidate,
  Game,
  GameCategory,
  GameEngine,
  GameMetadata,
  GameStatus,
  LaunchTarget,
  LibraryRoot,
  ManualField,
  MetadataStatus,
  PendingInstaller,
  RootCategory,
  RootKind
} from '@shared/types'
import type { StoredGame } from '../scanner/reconcile'
import type { InstallerCandidate, ScanCache, ScanCandidate } from '../scanner/types'
import type { Db } from './database'

interface GameRow {
  id: number
  install_path: string
  folder_name: string
  title: string
  search_title: string
  launch: string | null
  sources: string
  category: string
  engine: string
  confidence: number
  needs_review: number
  exe_candidates: string
  size_bytes: number
  status: string
  hidden: number
  favorite: number
  icon_path: string | null
  manual_fields: string
  metadata: string | null
  metadata_status: string
  added_at: string
  updated_at: string
  last_seen_at: string
  playtime_seconds: number
  last_played_at: string | null
  session_count: number
}

interface RootRow {
  id: number
  path: string
  kind: string
  category: string
  enabled: number
  last_scanned_at: string | null
}

/** Games plus their play statistics, computed from the sessions table. */
const GAME_SELECT = `
  SELECT g.*,
    COALESCE(s.total, 0) AS playtime_seconds,
    s.last_played AS last_played_at,
    COALESCE(s.count, 0) AS session_count
  FROM games g
  LEFT JOIN (
    SELECT game_id, SUM(seconds) AS total, MAX(started_at) AS last_played, COUNT(*) AS count
    FROM play_sessions GROUP BY game_id
  ) s ON s.game_id = g.id`

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function toGame(row: GameRow): Game {
  return {
    id: row.id,
    installPath: row.install_path,
    folderName: row.folder_name,
    title: row.title,
    searchTitle: row.search_title,
    launch: parseJson<LaunchTarget | null>(row.launch, null),
    sources: parseJson<DetectionSource[]>(row.sources, []),
    category: row.category as GameCategory,
    engine: row.engine as GameEngine,
    confidence: row.confidence,
    needsReview: row.needs_review === 1,
    exeCandidates: parseJson<ExecutableCandidate[]>(row.exe_candidates, []),
    sizeBytes: row.size_bytes,
    status: row.status as GameStatus,
    hidden: row.hidden === 1,
    favorite: row.favorite === 1,
    iconPath: row.icon_path,
    manualFields: parseJson<ManualField[]>(row.manual_fields, []),
    metadata: parseJson<GameMetadata | null>(row.metadata, null),
    metadataStatus: row.metadata_status as MetadataStatus,
    playtimeSeconds: row.playtime_seconds,
    lastPlayedAt: row.last_played_at,
    sessionCount: row.session_count,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at
  }
}

function now(): string {
  return new Date().toISOString()
}

export interface GameUpdate {
  title?: string
  launch?: LaunchTarget
  hidden?: boolean
  favorite?: boolean
  category?: GameCategory
  manualFields?: ManualField[]
  needsReview?: boolean
}

export class Repository {
  constructor(private readonly db: Db) {}

  // ------------------------------------------------------------------ games

  listGames(): Game[] {
    const rows = this.db.prepare(`${GAME_SELECT} ORDER BY g.title COLLATE NOCASE`).all() as GameRow[]
    return rows.map(toGame)
  }

  getGame(id: number): Game | null {
    const row = this.db.prepare(`${GAME_SELECT} WHERE g.id = ?`).get(id) as GameRow | undefined
    return row ? toGame(row) : null
  }

  storedGamesForReconcile(): StoredGame[] {
    return this.listGames().map((game) => {
      const exePath = game.launch?.type === 'exe' ? game.launch.exePath.toLowerCase() : null
      const exe = exePath ? game.exeCandidates.find((candidate) => candidate.path.toLowerCase() === exePath) : undefined
      return {
        id: game.id,
        installPath: game.installPath,
        folderName: game.folderName,
        status: game.status,
        launch: game.launch,
        exeSizeBytes: exe?.sizeBytes ?? null,
        manualFields: game.manualFields
      }
    })
  }

  insertGame(candidate: ScanCandidate): number {
    const timestamp = now()
    const result = this.db
      .prepare(
        `INSERT INTO games (install_path, folder_name, title, search_title, launch, sources, category, engine, confidence,
          needs_review, exe_candidates, size_bytes, status, metadata_status, added_at, updated_at, last_seen_at)
         VALUES (@installPath, @folderName, @title, @searchTitle, @launch, @sources, @category, @engine, @confidence,
          @needsReview, @exeCandidates, @sizeBytes, 'installed', @metadataStatus, @timestamp, @timestamp, @timestamp)`
      )
      .run({ ...this.candidateParams(candidate), metadataStatus: candidate.category === 'game' ? 'pending' : 'skipped', timestamp })
    return Number(result.lastInsertRowid)
  }

  /** Refreshes detected data. Fields the user edited by hand, and names that came from a metadata match, are kept. */
  applyScanResult(id: number, candidate: ScanCandidate): void {
    const current = this.getGame(id)
    if (!current) return
    const manual = new Set(current.manualFields)

    let launch: LaunchTarget | null = candidate.launch
    if (current.launch?.type === 'exe' && candidate.launch?.type === 'exe') {
      launch = {
        type: 'exe',
        exePath: manual.has('exe') ? current.launch.exePath : candidate.launch.exePath,
        workingDir: manual.has('exe') ? current.launch.workingDir : candidate.launch.workingDir,
        args: manual.has('args') ? current.launch.args : candidate.launch.args
      }
    } else if (manual.has('exe') && current.launch) {
      launch = current.launch
    }

    const params = this.candidateParams(candidate)
    // A launch file picked by hand (a .bat, a shortcut) stays in the list even when the scan does not see it.
    if (manual.has('exe') && launch?.type === 'exe') {
      const picked = launch.exePath.toLowerCase()
      if (!candidate.exeCandidates.some((exe) => exe.path.toLowerCase() === picked)) {
        const previous = current.exeCandidates.find((exe) => exe.path.toLowerCase() === picked)
        params.exeCandidates = JSON.stringify([previous ?? { path: launch.exePath, score: 100, sizeBytes: 0 }, ...candidate.exeCandidates])
      }
    }
    const category = manual.has('category') ? current.category : candidate.category
    const keepTitle = manual.has('title') || (current.metadataStatus === 'matched' && category === 'game')
    const searchTitleChanged = current.searchTitle !== candidate.searchTitle && !manual.has('match')

    let metadataStatus: MetadataStatus = current.metadataStatus
    if (category !== 'game') metadataStatus = 'skipped'
    else if (current.metadataStatus === 'skipped') metadataStatus = 'pending'
    // A better cleaned name deserves a new lookup when the old one found nothing.
    else if (current.metadataStatus === 'not_found' && searchTitleChanged) metadataStatus = 'pending'

    this.db
      .prepare(
        `UPDATE games SET install_path = @installPath, folder_name = @folderName, title = @title,
          search_title = @searchTitle, launch = @launch, sources = @sources, category = @category, engine = @engine,
          confidence = @confidence, needs_review = @needsReview, exe_candidates = @exeCandidates, size_bytes = @sizeBytes,
          status = 'installed', metadata_status = @metadataStatus, updated_at = @timestamp, last_seen_at = @timestamp
         WHERE id = @id`
      )
      .run({
        ...params,
        title: keepTitle ? current.title : params.title,
        category,
        launch: JSON.stringify(launch),
        needsReview: manual.has('exe') ? 0 : params.needsReview,
        metadataStatus,
        timestamp: now(),
        id
      })
  }

  setStatus(ids: number[], status: GameStatus): void {
    const statement = this.db.prepare('UPDATE games SET status = ?, updated_at = ? WHERE id = ?')
    const timestamp = now()
    for (const id of ids) statement.run(status, timestamp, id)
  }

  /** Adds a program the user picked by hand (an emulator). Picking an already known folder reuses that entry. */
  addManualEntry(entry: { exePath: string; installPath: string; title: string; category: GameCategory; sizeBytes: number }): number {
    const existing = this.listGames().find((game) => game.installPath.toLowerCase() === entry.installPath.toLowerCase())
    const launch: LaunchTarget = { type: 'exe', exePath: entry.exePath, args: '', workingDir: entry.installPath }
    if (existing) {
      const manual = new Set<ManualField>([...existing.manualFields, 'category', 'exe'])
      const candidates = existing.exeCandidates.some((candidate) => candidate.path.toLowerCase() === entry.exePath.toLowerCase())
        ? existing.exeCandidates
        : [{ path: entry.exePath, score: 100, sizeBytes: entry.sizeBytes }, ...existing.exeCandidates]
      this.db.prepare('UPDATE games SET exe_candidates = ?, hidden = 0 WHERE id = ?').run(JSON.stringify(candidates), existing.id)
      this.updateGame(existing.id, { category: entry.category, launch, manualFields: [...manual], needsReview: false })
      return existing.id
    }
    const id = this.insertGame({
      installPath: entry.installPath,
      folderName: entry.installPath.split(/[\\/]/).pop() ?? entry.title,
      title: entry.title,
      searchTitle: entry.title,
      sources: ['manual'],
      category: entry.category,
      engine: 'unknown',
      confidence: 100,
      needsReview: false,
      launch,
      exeCandidates: [{ path: entry.exePath, score: 100, sizeBytes: entry.sizeBytes }],
      sizeBytes: entry.sizeBytes
    })
    this.updateGame(id, { manualFields: ['category', 'exe'] })
    return id
  }

  /** Uses a file the user picked (an .exe, a .bat, a shortcut) to start the game. */
  setLaunchFile(id: number, filePath: string, sizeBytes: number): void {
    const game = this.getGame(id)
    if (!game) throw new Error('Game not found')
    const known = game.exeCandidates.some((candidate) => candidate.path.toLowerCase() === filePath.toLowerCase())
    const candidates = known ? game.exeCandidates : [{ path: filePath, score: 100, sizeBytes }, ...game.exeCandidates]
    this.db.prepare('UPDATE games SET exe_candidates = ? WHERE id = ?').run(JSON.stringify(candidates), id)
    const workingDir = filePath.replace(/[\\/][^\\/]+$/, '')
    this.updateGame(id, {
      launch: { type: 'exe', exePath: filePath, args: game.launch?.type === 'exe' ? game.launch.args : '', workingDir },
      manualFields: [...new Set([...game.manualFields, 'exe' as const])],
      needsReview: false
    })
  }

  deleteGames(ids: number[]): void {
    const statement = this.db.prepare('DELETE FROM games WHERE id = ?')
    for (const id of ids) statement.run(id)
  }

  setIcon(id: number, iconPath: string): void {
    this.db.prepare('UPDATE games SET icon_path = ? WHERE id = ?').run(iconPath, id)
  }

  updateGame(id: number, patch: GameUpdate): void {
    const current = this.getGame(id)
    if (!current) throw new Error(`Game ${id} not found`)
    const category = patch.category ?? current.category
    let metadataStatus = current.metadataStatus
    if (category !== 'game') metadataStatus = 'skipped'
    else if (current.metadataStatus === 'skipped') metadataStatus = 'pending'

    this.db
      .prepare(
        `UPDATE games SET title = @title, launch = @launch, hidden = @hidden, favorite = @favorite, category = @category,
          metadata_status = @metadataStatus, manual_fields = @manualFields, needs_review = @needsReview,
          updated_at = @timestamp WHERE id = @id`
      )
      .run({
        id,
        title: patch.title ?? current.title,
        launch: JSON.stringify(patch.launch ?? current.launch),
        hidden: (patch.hidden ?? current.hidden) ? 1 : 0,
        favorite: (patch.favorite ?? current.favorite) ? 1 : 0,
        category,
        metadataStatus,
        manualFields: JSON.stringify(patch.manualFields ?? current.manualFields),
        needsReview: (patch.needsReview ?? current.needsReview) ? 1 : 0,
        timestamp: now()
      })
  }

  /** Stores a metadata match. The official name becomes the title unless the user renamed the game. */
  setMetadata(id: number, metadata: GameMetadata | null, status: MetadataStatus, manualMatch = false): void {
    const current = this.getGame(id)
    if (!current) return
    const manual = new Set(current.manualFields)
    if (manualMatch) manual.add('match')
    const title = metadata && !manual.has('title') ? metadata.name : current.title
    this.db
      .prepare(
        `UPDATE games SET metadata = @metadata, metadata_status = @status, metadata_updated_at = @timestamp,
          title = @title, manual_fields = @manualFields WHERE id = @id`
      )
      .run({
        id,
        metadata: metadata ? JSON.stringify(metadata) : null,
        status,
        title,
        manualFields: JSON.stringify([...manual]),
        timestamp: now()
      })
  }

  gamesNeedingMetadata(): Game[] {
    return this.listGames().filter((game) => game.metadataStatus === 'pending' && game.category === 'game' && game.status === 'installed')
  }

  resetNotFound(): void {
    this.db.prepare(`UPDATE games SET metadata_status = 'pending' WHERE metadata_status = 'not_found' AND category = 'game'`).run()
  }

  private candidateParams(candidate: ScanCandidate) {
    return {
      installPath: candidate.installPath,
      folderName: candidate.folderName,
      title: candidate.title,
      searchTitle: candidate.searchTitle,
      launch: JSON.stringify(candidate.launch),
      sources: JSON.stringify(candidate.sources),
      category: candidate.category,
      engine: candidate.engine,
      confidence: candidate.confidence,
      needsReview: candidate.needsReview ? 1 : 0,
      exeCandidates: JSON.stringify(candidate.exeCandidates),
      sizeBytes: candidate.sizeBytes
    }
  }

  // ------------------------------------------------------------------ play sessions

  startSession(gameId: number, startedAt: string): number {
    const result = this.db
      .prepare('INSERT INTO play_sessions (game_id, started_at, ended_at, seconds) VALUES (?, ?, ?, 0)')
      .run(gameId, startedAt, startedAt)
    return Number(result.lastInsertRowid)
  }

  /** Called on every poll while the game runs, so a crash loses at most one poll interval. */
  extendSession(sessionId: number, endedAt: string, seconds: number): void {
    this.db.prepare('UPDATE play_sessions SET ended_at = ?, seconds = ? WHERE id = ?').run(endedAt, Math.max(0, Math.round(seconds)), sessionId)
  }

  // ------------------------------------------------------------------ installers

  listInstallers(): PendingInstaller[] {
    const rows = this.db.prepare('SELECT * FROM pending_installers ORDER BY kind, title COLLATE NOCASE').all() as {
      id: number
      kind: string
      path: string
      title: string
      size_bytes: number
      detected_at: string
    }[]
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind as PendingInstaller['kind'],
      path: row.path,
      title: row.title,
      sizeBytes: row.size_bytes,
      detectedAt: row.detected_at
    }))
  }

  /** Installers are a snapshot of the last scan, so the table is replaced each time. */
  replaceInstallers(installers: InstallerCandidate[]): void {
    const existing = new Map(this.listInstallers().map((installer) => [installer.path.toLowerCase(), installer.detectedAt]))
    const insert = this.db.prepare('INSERT INTO pending_installers (kind, path, title, size_bytes, detected_at) VALUES (?, ?, ?, ?, ?)')
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM pending_installers').run()
      for (const installer of installers) {
        insert.run(installer.kind, installer.path, installer.title, installer.sizeBytes, existing.get(installer.path.toLowerCase()) ?? now())
      }
    })()
  }

  // ------------------------------------------------------------------ roots

  listRoots(): Omit<LibraryRoot, 'available'>[] {
    const rows = this.db.prepare('SELECT * FROM library_roots ORDER BY kind DESC, path COLLATE NOCASE').all() as RootRow[]
    return rows.map((row) => ({
      id: row.id,
      path: row.path,
      kind: row.kind as RootKind,
      category: row.category as RootCategory,
      enabled: row.enabled === 1,
      lastScannedAt: row.last_scanned_at
    }))
  }

  /** Adds a root if it is not there yet. Returns its id either way. */
  upsertRoot(path: string, kind: RootKind, category: RootCategory): number {
    this.db.prepare('INSERT OR IGNORE INTO library_roots (path, kind, category, enabled) VALUES (?, ?, ?, 1)').run(path, kind, category)
    const row = this.db.prepare('SELECT id FROM library_roots WHERE path = ?').get(path) as { id: number }
    return row.id
  }

  removeRoot(id: number): void {
    this.db.prepare('DELETE FROM library_roots WHERE id = ?').run(id)
  }

  setRootEnabled(id: number, enabled: boolean): void {
    this.db.prepare('UPDATE library_roots SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
  }

  markRootsScanned(paths: string[]): void {
    const statement = this.db.prepare('UPDATE library_roots SET last_scanned_at = ? WHERE path = ?')
    const timestamp = now()
    for (const path of paths) statement.run(timestamp, path)
  }

  // ------------------------------------------------------------------ scan cache

  loadScanCache(): ScanCache {
    const rows = this.db.prepare('SELECT * FROM scan_cache').all() as { path_key: string; signature: string; size_bytes: number }[]
    const cache: ScanCache = {}
    for (const row of rows) cache[row.path_key] = { signature: row.signature, sizeBytes: row.size_bytes }
    return cache
  }

  saveScanCache(cache: ScanCache): void {
    const insert = this.db.prepare('INSERT INTO scan_cache (path_key, signature, size_bytes) VALUES (?, ?, ?)')
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM scan_cache').run()
      for (const [key, entry] of Object.entries(cache)) insert.run(key, entry.signature, entry.sizeBytes)
    })()
  }

  // ------------------------------------------------------------------ settings

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? null
  }

  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
  }

  deleteSetting(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  }

  /** Runs several writes atomically. */
  transaction(work: () => void): void {
    this.db.transaction(work)()
  }
}
