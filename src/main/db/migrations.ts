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
  },
  {
    version: 2,
    sql: `
      ALTER TABLE games ADD COLUMN category TEXT NOT NULL DEFAULT 'game' CHECK (category IN ('game', 'tool'));
      ALTER TABLE games ADD COLUMN metadata TEXT;
      ALTER TABLE games ADD COLUMN metadata_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (metadata_status IN ('pending', 'matched', 'not_found', 'skipped'));
      ALTER TABLE games ADD COLUMN metadata_updated_at TEXT;

      ALTER TABLE pending_installers ADD COLUMN kind TEXT NOT NULL DEFAULT 'installer' CHECK (kind IN ('installer', 'update'));

      CREATE TABLE play_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        seconds INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX play_sessions_game ON play_sessions(game_id, started_at);
    `
  },
  {
    // Emulators get their own section. SQLite cannot change a CHECK constraint, so the table is rebuilt.
    // Foreign keys are off while migrations run, so play sessions survive the rebuild.
    version: 3,
    sql: `
      CREATE TABLE games_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        install_path TEXT NOT NULL UNIQUE COLLATE NOCASE,
        folder_name TEXT NOT NULL,
        title TEXT NOT NULL,
        search_title TEXT NOT NULL,
        launch TEXT,
        sources TEXT NOT NULL DEFAULT '[]',
        category TEXT NOT NULL DEFAULT 'game' CHECK (category IN ('game', 'tool', 'emulator')),
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
        metadata TEXT,
        metadata_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (metadata_status IN ('pending', 'matched', 'not_found', 'skipped')),
        metadata_updated_at TEXT,
        added_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      INSERT INTO games_new (id, install_path, folder_name, title, search_title, launch, sources, category, engine, confidence, needs_review, exe_candidates, size_bytes, status, hidden, favorite, icon_path, manual_fields, metadata, metadata_status, metadata_updated_at, added_at, updated_at, last_seen_at) SELECT id, install_path, folder_name, title, search_title, launch, sources, category, engine, confidence, needs_review, exe_candidates, size_bytes, status, hidden, favorite, icon_path, manual_fields, metadata, metadata_status, metadata_updated_at, added_at, updated_at, last_seen_at FROM games;
      DROP TABLE games;
      ALTER TABLE games_new RENAME TO games;
      CREATE INDEX games_status ON games(status);
    `
  },
  {
    // Console games found as files (Nintendo Switch .nsp) and folders the scan must skip.
    version: 4,
    sql: `
      ALTER TABLE games ADD COLUMN platform TEXT NOT NULL DEFAULT 'pc';
      CREATE TABLE excluded_paths (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE COLLATE NOCASE,
        label TEXT,
        added_at TEXT NOT NULL
      );
    `
  }
]
