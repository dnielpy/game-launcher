import Database from 'better-sqlite3'

/**
 * better-sqlite3 is compiled for Electron after `npm install`, so plain Node may
 * not load it (Windows CI, for example). Database tests are skipped in that case.
 */
export const sqliteAvailable = (() => {
  try {
    new Database(':memory:').close()
    return true
  } catch {
    return false
  }
})()
