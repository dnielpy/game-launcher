import Database from 'better-sqlite3'
import { sqliteAvailable } from './sqlite'
import { describe, expect, it } from 'vitest'
import { migrate } from '../src/main/db/database'
import { MIGRATIONS } from '../src/main/db/migrations'
import { Repository } from '../src/main/db/repository'
import type { GameMetadata } from '../src/shared/types'
import type { ScanCandidate } from '../src/main/scanner/types'

function setup() {
  const db = new Database(':memory:')
  migrate(db)
  return new Repository(db)
}

function candidate(overrides: Partial<ScanCandidate> = {}): ScanCandidate {
  return {
    installPath: 'D:\\Juegos\\Forza Horizon 5',
    folderName: 'Forza Horizon 5 MULTi16 ElAmigos',
    title: 'Forza Horizon 5 Premium Edition',
    searchTitle: 'Forza Horizon 5',
    sources: ['folder'],
    category: 'game',
    engine: 'unknown',
    confidence: 80,
    needsReview: false,
    launch: { type: 'exe', exePath: 'D:\\Juegos\\Forza Horizon 5\\ForzaHorizon5.exe', args: '', workingDir: 'D:\\Juegos\\Forza Horizon 5' },
    exeCandidates: [{ path: 'D:\\Juegos\\Forza Horizon 5\\ForzaHorizon5.exe', score: 50, sizeBytes: 100 }],
    sizeBytes: 1000,
    ...overrides
  }
}

const metadata: GameMetadata = {
  source: 'steam',
  externalId: '1551360',
  name: 'Forza Horizon 5',
  shortDescription: 'Drive',
  description: null,
  releaseDate: 'Nov 8, 2021',
  genres: ['Racing'],
  developers: [],
  publishers: [],
  rating: 90,
  ratingLabel: 'Very Positive',
  ratingCount: 1000,
  metacritic: 92,
  storeUrl: null,
  coverFile: 'cover.jpg',
  heroFile: 'hero.jpg',
  logoFile: null,
  screenshotFiles: []
}

describe.skipIf(!sqliteAvailable)('Repository', () => {
  it('queues new games for metadata and skips tools', () => {
    const repository = setup()
    repository.insertGame(candidate())
    repository.insertGame(candidate({ installPath: 'C:\\MSI Afterburner', title: 'MSI Afterburner', category: 'tool' }))
    expect(repository.gamesNeedingMetadata().map((game) => game.title)).toEqual(['Forza Horizon 5 Premium Edition'])
  })

  it('uses the catalog name as the title and keeps it across rescans', () => {
    const repository = setup()
    const id = repository.insertGame(candidate())
    repository.setMetadata(id, metadata, 'matched')
    expect(repository.getGame(id)!.title).toBe('Forza Horizon 5')
    repository.applyScanResult(id, candidate({ title: 'Forza Horizon 5 Premium Edition' }))
    expect(repository.getGame(id)!.title).toBe('Forza Horizon 5')
    expect(repository.getGame(id)!.metadata?.coverFile).toBe('cover.jpg')
  })

  it('never replaces a name the user typed', () => {
    const repository = setup()
    const id = repository.insertGame(candidate())
    repository.updateGame(id, { title: 'FH5', manualFields: ['title'] })
    repository.setMetadata(id, metadata, 'matched')
    expect(repository.getGame(id)!.title).toBe('FH5')
  })

  it('adds up play sessions', () => {
    const repository = setup()
    const id = repository.insertGame(candidate())
    const first = repository.startSession(id, '2026-11-01T10:00:00.000Z')
    repository.extendSession(first, '2026-11-01T11:00:00.000Z', 3600)
    const second = repository.startSession(id, '2026-11-02T10:00:00.000Z')
    repository.extendSession(second, '2026-11-02T10:30:00.000Z', 1800)
    const game = repository.getGame(id)!
    expect(game.playtimeSeconds).toBe(5400)
    expect(game.sessionCount).toBe(2)
    expect(game.lastPlayedAt).toBe('2026-11-02T10:00:00.000Z')
  })

  it('moves a game to tools and back', () => {
    const repository = setup()
    const id = repository.insertGame(candidate())
    repository.updateGame(id, { category: 'tool', manualFields: ['category'] })
    expect(repository.getGame(id)!.metadataStatus).toBe('skipped')
    repository.updateGame(id, { category: 'game' })
    expect(repository.getGame(id)!.metadataStatus).toBe('pending')
  })

  it('adds an emulator picked by hand, or converts a detected entry', () => {
    const repository = setup()
    const added = repository.addManualEntry({ exePath: 'E:\\Emus\\PCSX2\\pcsx2-qt.exe', installPath: 'E:\\Emus\\PCSX2', title: 'PCSX2', category: 'emulator', sizeBytes: 5 })
    expect(repository.getGame(added)).toMatchObject({ category: 'emulator', metadataStatus: 'skipped', sources: ['manual'], manualFields: ['category', 'exe'] })

    const detected = repository.insertGame(candidate({ installPath: 'E:\\Emus\\Dolphin', title: 'Dolphin', category: 'tool' }))
    const again = repository.addManualEntry({ exePath: 'E:\\Emus\\Dolphin\\Dolphin.exe', installPath: 'e:\\emus\\dolphin', title: 'Dolphin', category: 'emulator', sizeBytes: 5 })
    expect(again).toBe(detected)
    expect(repository.getGame(detected)!.category).toBe('emulator')
    expect(repository.getGame(detected)!.launch).toMatchObject({ exePath: 'E:\\Emus\\Dolphin\\Dolphin.exe' })
  })

  it('stores installer kinds', () => {
    const repository = setup()
    repository.replaceInstallers([{ kind: 'update', path: 'D:\\x', title: 'Forza Horizon 6', sizeBytes: 1 }])
    expect(repository.listInstallers()[0]!.kind).toBe('update')
  })
})

describe.skipIf(!sqliteAvailable)('migration 3', () => {
  it('keeps games and play sessions when the games table is rebuilt', () => {
    const db = new Database(':memory:')
    // Apply versions 1 and 2 only, as an older install would have.
    for (const migration of MIGRATIONS.filter((item) => item.version <= 2)) {
      db.exec(migration.sql)
      db.pragma(`user_version = ${migration.version}`)
    }
    db.prepare(`INSERT INTO games (install_path, folder_name, title, search_title, added_at, updated_at, last_seen_at) VALUES ('C:\\\\yuzu', 'yuzu', 'yuzu', 'yuzu', 'a', 'a', 'a')`).run()
    db.prepare(`INSERT INTO play_sessions (game_id, started_at, ended_at, seconds) VALUES (1, 'a', 'b', 600)`).run()
    db.pragma('foreign_keys = ON')

    migrate(db)
    db.pragma('foreign_keys = ON')
    const repository = new Repository(db)
    expect(repository.getGame(1)!.playtimeSeconds).toBe(600)
    repository.updateGame(1, { category: 'emulator' })
    expect(repository.getGame(1)!.category).toBe('emulator')
    expect(db.pragma('foreign_key_check')).toEqual([])
  })
})
