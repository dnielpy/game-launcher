import Database from 'better-sqlite3'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BackupService, type ProfileAccess } from '../src/main/backup/backupService'
import { migrate } from '../src/main/db/database'
import { Repository } from '../src/main/db/repository'
import type { ScanCandidate } from '../src/main/scanner/types'
import type { GameMetadata, ProfileState } from '../src/shared/types'
import { sqliteAvailable } from './sqlite'
import { tempDir } from './fixtures'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

function candidate(overrides: Partial<ScanCandidate> = {}): ScanCandidate {
  return {
    installPath: 'D:\\Juegos\\Hades',
    folderName: 'Hades',
    title: 'Hades',
    searchTitle: 'Hades',
    sources: ['folder'],
    category: 'game',
    engine: 'unknown',
    confidence: 80,
    needsReview: false,
    launch: { type: 'exe', exePath: 'D:\\Juegos\\Hades\\Hades.exe', args: '', workingDir: 'D:\\Juegos\\Hades' },
    exeCandidates: [{ path: 'D:\\Juegos\\Hades\\Hades.exe', score: 50, sizeBytes: 100 }],
    sizeBytes: 1000,
    ...overrides
  }
}

const metadata: GameMetadata = {
  source: 'steam',
  externalId: '1145360',
  name: 'Hades',
  shortDescription: 'Escape the underworld',
  description: 'Long description',
  releaseDate: 'Sep 17, 2020',
  genres: ['Action'],
  developers: ['Supergiant'],
  publishers: [],
  rating: 98,
  ratingLabel: 'Overwhelmingly Positive',
  ratingCount: 1,
  metacritic: 93,
  storeUrl: null,
  coverFile: 'cover.jpg',
  heroFile: null,
  logoFile: null,
  screenshotFiles: ['shot1.jpg']
}

class FakeProfile implements ProfileAccess {
  state: ProfileState = { created: false, name: '', avatarFile: null }
  avatar: Buffer | null = null
  get() {
    return this.state
  }
  setName(name: string) {
    this.state = { ...this.state, created: true, name }
    return this.state
  }
  avatarPath() {
    return this.avatarFile
  }
  avatarFile: string | null = null
  async setPhotoFromBuffer(png: Buffer) {
    this.avatar = png
    this.state = { ...this.state, avatarFile: 'avatar-1.png' }
    return this.state
  }
}

function environment(name: string) {
  const dir = tempDir(`backup-${name}-`)
  cleanups.push(dir.cleanup)
  const db = new Database(':memory:')
  migrate(db)
  const repository = new Repository(db)
  const profile = new FakeProfile()
  const directories = { games: path.join(dir.path, 'games'), icons: path.join(dir.path, 'icons') }
  return { dir: dir.path, repository, profile, directories, service: new BackupService(repository, profile, directories, '0.5.0') }
}

describe.skipIf(!sqliteAvailable)('BackupService', () => {
  it('moves games, hours, covers and the profile to another library', async () => {
    const source = environment('source')
    const id = source.repository.insertGame(candidate())
    source.repository.setMetadata(id, metadata, 'matched')
    source.repository.updateGame(id, { favorite: true })
    source.repository.setIcon(id, `${id}.png`)
    const session = source.repository.startSession(id, '2026-01-01T10:00:00.000Z')
    source.repository.extendSession(session, '2026-01-01T12:00:00.000Z', 7200)
    await fs.mkdir(path.join(source.directories.games, String(id)), { recursive: true })
    await fs.writeFile(path.join(source.directories.games, String(id), 'cover.jpg'), 'COVER')
    await fs.writeFile(path.join(source.directories.games, String(id), 'shot1.jpg'), 'SHOT')
    await fs.mkdir(source.directories.icons, { recursive: true })
    await fs.writeFile(path.join(source.directories.icons, `${id}.png`), 'ICON')
    source.profile.setName('Daniel')
    await fs.writeFile(path.join(source.dir, 'avatar.png'), 'AVATAR')
    source.profile.avatarFile = path.join(source.dir, 'avatar.png')

    source.repository.addExcludedPath('D:\\Juegos\\Old', 'Old game')
    source.repository.setRootEnabled(source.repository.upsertRoot('E:\\Games', 'user', 'games'), false)
    const emulatorId = source.repository.insertGame(candidate({ installPath: 'C:\\Emus\\yuzu', title: 'yuzu', folderName: 'yuzu', category: 'emulator' }))
    source.repository.setSetting('skin', 'cinema')
    source.repository.setSetting('emulation.switch.enabled', '1')
    source.repository.setSetting('emulation.switch.emulator', String(emulatorId))
    source.repository.setSetting('rawgApiKey', 'plain:secret')

    const file = path.join(source.dir, 'backup.orus')
    const exported = await source.service.export(file)
    expect(exported).toMatchObject({ games: 2, sessions: 1, images: 2 })
    expect(await source.service.verify(file)).toEqual({ games: 2, sessions: 1, files: 4 })

    // Another PC: different ids, so the new game must get its own image folder.
    const target = environment('target')
    target.repository.insertGame(candidate({ installPath: 'C:\\Other', title: 'Other', folderName: 'Other' }))
    const summary = await target.service.import(file)
    expect(summary).toMatchObject({ gamesAdded: 2, gamesMerged: 0, sessionsAdded: 1, imagesRestored: 2, profileRestored: true })
    expect(target.repository.listExcludedPaths()).toMatchObject([{ path: 'D:\\Juegos\\Old', label: 'Old game' }])
    expect(target.repository.listRoots()).toMatchObject([{ path: 'E:\\Games', kind: 'user', enabled: false }])
    expect(target.repository.getSetting('skin')).toBe('cinema')
    expect(target.repository.getSetting('emulation.switch.enabled')).toBe('1')
    const newEmulator = target.repository.findGameByPath('C:\\Emus\\yuzu')!
    expect(target.repository.getSetting('emulation.switch.emulator')).toBe(String(newEmulator.id))
    // API keys never travel in a backup.
    expect(target.repository.getSetting('rawgApiKey')).toBeNull()

    const imported = target.repository.findGameByPath('D:\\Juegos\\Hades')!
    expect(imported.id).not.toBe(id)
    expect(imported.playtimeSeconds).toBe(7200)
    expect(imported.favorite).toBe(true)
    expect(imported.metadata?.description).toBe('Long description')
    expect(imported.iconPath).toBe(`${imported.id}.png`)
    expect(await fs.readFile(path.join(target.directories.games, String(imported.id), 'cover.jpg'), 'utf8')).toBe('COVER')
    expect(await fs.readFile(path.join(target.directories.icons, `${imported.id}.png`), 'utf8')).toBe('ICON')
    expect(target.profile.state.name).toBe('Daniel')
    expect(target.profile.avatar?.toString()).toBe('AVATAR')
  })

  it('merges into existing games without duplicating hours or replacing anything', async () => {
    const source = environment('source')
    const id = source.repository.insertGame(candidate())
    source.repository.setMetadata(id, metadata, 'matched')
    for (const [start, seconds] of [['2026-01-01T10:00:00.000Z', 3600], ['2026-01-02T10:00:00.000Z', 1800]] as const) {
      const session = source.repository.startSession(id, start)
      source.repository.extendSession(session, start, seconds)
    }
    await fs.mkdir(path.join(source.directories.games, String(id)), { recursive: true })
    await fs.writeFile(path.join(source.directories.games, String(id), 'cover.jpg'), 'COVER')
    const file = path.join(source.dir, 'backup.orus')
    await source.service.export(file)

    const target = environment('target')
    const existing = target.repository.insertGame(candidate())
    target.repository.updateGame(existing, { title: 'My own name', manualFields: ['title'] })
    const session = target.repository.startSession(existing, '2026-01-01T10:00:00.000Z')
    target.repository.extendSession(session, '2026-01-01T10:00:00.000Z', 3600)
    target.profile.setName('Already here')

    const first = await target.service.import(file)
    expect(first).toMatchObject({ gamesAdded: 0, gamesMerged: 1, sessionsAdded: 1, profileRestored: false })
    const merged = target.repository.getGame(existing)!
    expect(merged.title).toBe('My own name')
    expect(merged.playtimeSeconds).toBe(3600 + 1800)
    expect(merged.metadata?.name).toBe('Hades')
    expect(await fs.readFile(path.join(target.directories.games, String(existing), 'cover.jpg'), 'utf8')).toBe('COVER')

    // Importing the same file again changes nothing.
    const again = await target.service.import(file)
    expect(again).toMatchObject({ gamesAdded: 0, sessionsAdded: 0 })
    expect(target.repository.getGame(existing)!.playtimeSeconds).toBe(5400)
  })

  it('rejects files that are not backups', async () => {
    const target = environment('target')
    const bogus = path.join(target.dir, 'bogus.orus')
    await fs.writeFile(bogus, 'nope')
    await expect(target.service.import(bogus)).rejects.toThrow('not an Orus data file')
  })

  it('verify catches a damaged backup, and wipeAll leaves an empty library', async () => {
    const source = environment('source')
    const id = source.repository.insertGame(candidate())
    await fs.mkdir(path.join(source.directories.games, String(id)), { recursive: true })
    await fs.writeFile(path.join(source.directories.games, String(id), 'cover.jpg'), 'COVER')
    const file = path.join(source.dir, 'backup.orus')
    await source.service.export(file)
    const bytes = await fs.readFile(file)
    await fs.writeFile(file, bytes.subarray(0, bytes.length - 2))
    await expect(source.service.verify(file)).rejects.toThrow()

    source.repository.setSetting('skin', 'mosaic')
    source.repository.addExcludedPath('X:\\a')
    source.repository.wipeAll()
    expect(source.repository.listGames()).toEqual([])
    expect(source.repository.listExcludedPaths()).toEqual([])
    expect(source.repository.getSetting('skin')).toBeNull()
  })
})
