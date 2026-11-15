import Database from 'better-sqlite3'
import { sqliteAvailable } from './sqlite'
import { describe, expect, it } from 'vitest'
import { migrate } from '../src/main/db/database'
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

  it('stores installer kinds', () => {
    const repository = setup()
    repository.replaceInstallers([{ kind: 'update', path: 'D:\\x', title: 'Forza Horizon 6', sizeBytes: 1 }])
    expect(repository.listInstallers()[0]!.kind).toBe('update')
  })
})
