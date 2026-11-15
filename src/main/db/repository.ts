import type {
  DetectionSource,
  ExecutableCandidate,
  Game,
  GameEngine,
  GameStatus,
  LaunchTarget,
  LibraryRoot,
  ManualField,
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
  added_at: string
  updated_at: string
  last_seen_at: string
}

interface RootRow {
  id: number
  path: string
  kind: string
  category: string
  enabled: number
  last_scanned_at: string | null
}

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
    addedAt: row.added_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at
  }
}

function now(): string {
  return new Date().toISOString()
}

export class Repository {
  constructor(private readonly db: Db) {}

  // ------------------------------------------------------------------ games

  listGames(): Game[] {
    const rows = this.db.prepare('SELECT * FROM games ORDER BY title COLLATE NOCASE').all() as GameRow[]
    return rows.map(toGame)
  }

  getGame(id: number): Game | null {
    const row = this.db.prepare('SELECT * FROM games WHERE id = ?').get(id) as GameRow | undefined
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
        `INSERT INTO games (install_path, folder_name, title, search_title, launch, sources, engine, confidence,
          needs_review, exe_candidates, size_bytes, status, added_at, updated_at, last_seen_at)
         VALUES (@installPath, @folderName, @title, @searchTitle, @launch, @sources, @engine, @confidence,
          @needsReview, @exeCandidates, @sizeBytes, 'installed', @timestamp, @timestamp, @timestamp)`
      )
      .run({ ...this.candidateParams(candidate), timestamp })
    return Number(result.lastInsertRowid)
  }

  /** Refreshes detected data. Fields the user edited by hand are left alone. */
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
    this.db
      .prepare(
        `UPDATE games SET install_path = @installPath, folder_name = @folderName, title = @title,
          search_title = @searchTitle, launch = @launch, sources = @sources, engine = @engine, confidence = @confidence,
          needs_review = @needsReview, exe_candidates = @exeCandidates, size_bytes = @sizeBytes, status = 'installed',
          updated_at = @timestamp, last_seen_at = @timestamp
         WHERE id = @id`
      )
      .run({
        ...params,
        title: manual.has('title') ? current.title : params.title,
        launch: JSON.stringify(launch),
        needsReview: manual.has('exe') ? 0 : params.needsReview,
        timestamp: now(),
        id
      })
  }

  setStatus(ids: number[], status: GameStatus): void {
    const statement = this.db.prepare('UPDATE games SET status = ?, updated_at = ? WHERE id = ?')
    const timestamp = now()
    for (const id of ids) statement.run(status, timestamp, id)
  }

  setIcon(id: number, iconPath: string): void {
    this.db.prepare('UPDATE games SET icon_path = ? WHERE id = ?').run(iconPath, id)
  }

  updateGame(id: number, patch: { title?: string; launch?: LaunchTarget; hidden?: boolean; favorite?: boolean; manualFields?: ManualField[]; needsReview?: boolean }): void {
    const current = this.getGame(id)
    if (!current) throw new Error(`Game ${id} not found`)
    this.db
      .prepare(
        `UPDATE games SET title = @title, launch = @launch, hidden = @hidden, favorite = @favorite,
          manual_fields = @manualFields, needs_review = @needsReview, updated_at = @timestamp WHERE id = @id`
      )
      .run({
        id,
        title: patch.title ?? current.title,
        launch: JSON.stringify(patch.launch ?? current.launch),
        hidden: (patch.hidden ?? current.hidden) ? 1 : 0,
        favorite: (patch.favorite ?? current.favorite) ? 1 : 0,
        manualFields: JSON.stringify(patch.manualFields ?? current.manualFields),
        needsReview: (patch.needsReview ?? current.needsReview) ? 1 : 0,
        timestamp: now()
      })
  }

  private candidateParams(candidate: ScanCandidate) {
    return {
      installPath: candidate.installPath,
      folderName: candidate.folderName,
      title: candidate.title,
      searchTitle: candidate.searchTitle,
      launch: JSON.stringify(candidate.launch),
      sources: JSON.stringify(candidate.sources),
      engine: candidate.engine,
      confidence: candidate.confidence,
      needsReview: candidate.needsReview ? 1 : 0,
      exeCandidates: JSON.stringify(candidate.exeCandidates),
      sizeBytes: candidate.sizeBytes
    }
  }

  // ------------------------------------------------------------------ installers

  listInstallers(): PendingInstaller[] {
    const rows = this.db.prepare('SELECT * FROM pending_installers ORDER BY title COLLATE NOCASE').all() as {
      id: number
      path: string
      title: string
      size_bytes: number
      detected_at: string
    }[]
    return rows.map((row) => ({ id: row.id, path: row.path, title: row.title, sizeBytes: row.size_bytes, detectedAt: row.detected_at }))
  }

  /** Installers are a snapshot of the last scan, so the table is replaced each time. */
  replaceInstallers(installers: InstallerCandidate[]): void {
    const existing = new Map(this.listInstallers().map((installer) => [installer.path.toLowerCase(), installer.detectedAt]))
    const insert = this.db.prepare('INSERT INTO pending_installers (path, title, size_bytes, detected_at) VALUES (?, ?, ?, ?)')
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM pending_installers').run()
      for (const installer of installers) {
        insert.run(installer.path, installer.title, installer.sizeBytes, existing.get(installer.path.toLowerCase()) ?? now())
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

  /** Runs several writes atomically. */
  transaction(work: () => void): void {
    this.db.transaction(work)()
  }
}
