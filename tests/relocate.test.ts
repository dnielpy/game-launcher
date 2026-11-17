import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { planRelocation, remapPath } from '../src/main/services/relocate'
import type { Game } from '../src/shared/types'
import { createTree, tempDir } from './fixtures'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

function game(overrides: Partial<Game>): Game {
  return {
    id: 1,
    installPath: 'D:\\Juegos\\Hades',
    folderName: 'Hades',
    title: 'Hades',
    searchTitle: 'Hades',
    launch: { type: 'exe', exePath: 'D:\\Juegos\\Hades\\x64\\Hades.exe', args: '-windowed', workingDir: 'D:\\Juegos\\Hades\\x64' },
    sources: ['folder'],
    category: 'game',
    platform: 'pc',
    engine: 'unknown',
    confidence: 80,
    needsReview: false,
    exeCandidates: [{ path: 'D:\\Juegos\\Hades\\x64\\Hades.exe', score: 70, sizeBytes: 10 }],
    sizeBytes: 100,
    status: 'missing',
    hidden: false,
    favorite: false,
    iconPath: null,
    manualFields: [],
    metadata: null,
    metadataStatus: 'matched',
    playtimeSeconds: 3600,
    lastPlayedAt: null,
    sessionCount: 1,
    addedAt: '',
    updatedAt: '',
    lastSeenAt: '',
    ...overrides
  }
}

describe('remapPath', () => {
  it('keeps the position inside the folder and ignores paths outside it', () => {
    const moved = remapPath('D:\\Juegos\\Hades\\x64\\Hades.exe', 'D:\\Juegos\\Hades', path.join('E:', 'Games', 'Hades'))
    expect(moved).toBe(path.join('E:', 'Games', 'Hades', 'x64', 'Hades.exe'))
    expect(remapPath('D:\\Juegos\\Hades2\\a.exe', 'D:\\Juegos\\Hades', 'E:\\x')).toBeNull()
    expect(remapPath('C:\\Tools\\run.bat', 'D:\\Juegos\\Hades', 'E:\\x')).toBeNull()
  })

  it('is case-insensitive like Windows paths', () => {
    expect(remapPath('d:\\juegos\\hades\\a.exe', 'D:\\Juegos\\Hades\\', '/new')).toBe(path.join('/new', 'a.exe'))
  })
})

describe('planRelocation', () => {
  it('keeps the chosen executable and launch options when the folder was just moved', async () => {
    const dir = tempDir('relocate-')
    cleanups.push(dir.cleanup)
    const target = path.join(dir.path, 'Hades')
    createTree(target, { x64: { 'Hades.exe': 5_000_000 }, 'Hades.dll': 10 })

    const plan = await planRelocation(game({}), target)
    expect(plan.installPath).toBe(target)
    expect(plan.launch).toEqual({ type: 'exe', exePath: path.join(target, 'x64', 'Hades.exe'), args: '-windowed', workingDir: path.join(target, 'x64') })
    expect(plan.exeCandidates[0]?.path).toBe(path.join(target, 'x64', 'Hades.exe'))
    expect(plan.needsReview).toBe(false)
  })

  it('searches the new folder when the old layout is not there', async () => {
    const dir = tempDir('relocate-')
    cleanups.push(dir.cleanup)
    const target = path.join(dir.path, 'Hades Reinstalled')
    createTree(target, { 'Hades.exe': 30_000_000, 'unins000.exe': 100_000, 'Hades.pak': 50_000_000 })

    const plan = await planRelocation(game({}), target)
    expect(plan.launch?.type === 'exe' && plan.launch.exePath).toBe(path.join(target, 'Hades.exe'))
    expect(plan.launch?.type === 'exe' && plan.launch.args).toBe('-windowed')
  })

  it('refuses a folder with no game inside and a path that is not a folder', async () => {
    const dir = tempDir('relocate-')
    cleanups.push(dir.cleanup)
    const empty = path.join(dir.path, 'Empty')
    createTree(empty, { 'readme.txt': 'nothing here' })
    await expect(planRelocation(game({}), empty)).rejects.toThrow('Could not find the game')
    await expect(planRelocation(game({}), path.join(dir.path, 'nope'))).rejects.toThrow('not a folder')
  })
})
