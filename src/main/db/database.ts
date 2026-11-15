import Database from 'better-sqlite3'
import { MIGRATIONS } from './migrations'

export type Db = Database.Database

export function openDatabase(file: string): Db {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  migrate(db)
  db.pragma('foreign_keys = ON')
  return db
}

/** Runs pending migrations. Foreign keys must be off: some migrations rebuild tables that others point to. */
export function migrate(db: Db): void {
  db.pragma('foreign_keys = OFF')
  const current = db.pragma('user_version', { simple: true }) as number
  const pending = MIGRATIONS.filter((migration) => migration.version > current).sort((a, b) => a.version - b.version)
  for (const migration of pending) {
    db.transaction(() => {
      db.exec(migration.sql)
      db.pragma(`user_version = ${migration.version}`)
    })()
  }
}
