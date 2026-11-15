/** Ordered schema migrations. Never edit a shipped migration; add a new one instead. */
export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE library_roots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE COLLATE NOCASE,
        kind TEXT NOT NULL CHECK (kind IN ('auto', 'user')),
        category TEXT NOT NULL CHECK (category IN ('games', 'noisy')),
        enabled INTEGER NOT NULL DEFAULT 1,
        last_scanned_at TEXT
      );

      CREATE TABLE games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        install_path TEXT NOT NULL UNIQUE COLLATE NOCASE,
        folder_name TEXT NOT NULL,
        title TEXT NOT NULL,
        search_title TEXT NOT NULL,
        launch TEXT,
        sources TEXT NOT NULL DEFAULT '[]',
        engine TEXT NOT NULL DEFAULT 'unknown',
        confidence INTEGER NOT NULL DEFAULT 0,
        needs_review INTEGER NOT NULL DEFAULT 0,
        exe_candidates TEXT NOT NULL DEFAULT '[]',
        size_bytes INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'installed' CHECK (status IN ('installed', 'missing', 'unavailable')),
        hidden INTEGER NOT NULL DEFAULT 0,
        favorite INTEGER NOT NULL DEFAULT 0,
        icon_path TEXT,
        manual_fields TEXT NOT NULL DEFAULT '[]',
        added_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE INDEX games_status ON games(status);

      CREATE TABLE pending_installers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE COLLATE NOCASE,
        title TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        detected_at TEXT NOT NULL
      );

      CREATE TABLE scan_cache (
        path_key TEXT PRIMARY KEY,
        signature TEXT NOT NULL,
        size_bytes INTEGER NOT NULL
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `
  }
]
