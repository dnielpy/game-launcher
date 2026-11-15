import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gameFolderForExe, runScan, ScanCancelledError, type ScanDependencies } from '../src/main/scanner/scanEngine'
import type { ScanInput, ScanOutput } from '../src/main/scanner/types'
import { createTree, layouts, tempDir } from './fixtures'

const MB = 1024 * 1024
let dir: { path: string; cleanup: () => void }
let output: ScanOutput

const noSources: ScanDependencies = {
  readRegistry: async () => [],
  readSteam: async () => [],
  readEpic: async () => []
}

function p(...parts: string[]): string {
  return path.join(dir.path, ...parts)
}

beforeAll(async () => {
  dir = tempDir()
  createTree(dir.path, {
    Games: {
      'Hollow Knight': layouts.unity('hollow_knight'),
      'S.T.A.L.K.E.R. 2 [FitGirl Repack]': layouts.unreal('Stalker2'),
      'Celeste v1.4': layouts.indie('Celeste'),
      Indies: { 'Game A': layouts.indie('GameA'), 'Game B': layouts.indie('GameB') },
      'Balatro': { Balatro: layouts.indie('Balatro') },
      'Elden Ring [FitGirl Repack]': layouts.fitgirlInstaller(),
      'Screenshots': { 'shot1.png': 100 },
      'node_modules': { 'evil.exe': 100 }
    },
    'Program Files': {
      'Notepad++': layouts.desktopApp('notepad++'),
      'Hades II': layouts.innoInstalled('Hades2')
    },
    Elsewhere: {
      'Registry Game': layouts.innoInstalled('RegGame'),
      'Shortcut Game': { bin: { 'ShortcutGame.exe': 70 * MB, 'steam_api64.dll': 1000 } },
      'Random Tool': { 'tool.exe': 1 * MB }
    },
    SteamLib: { 'Portal 2': { 'portal2.exe': 10 * MB, bin: { 'engine.dll': 100 } } }
  })

  const input: ScanInput = {
    roots: [
      { path: p('Games'), category: 'games' },
      { path: p('Program Files'), category: 'noisy' },
      { path: p('Missing Drive'), category: 'games' }
    ],
    shortcuts: [
      { shortcutPath: 'desk.lnk', targetPath: p('Elsewhere', 'Shortcut Game', 'bin', 'ShortcutGame.exe'), args: '-windowed', workingDir: '' },
      { shortcutPath: 'tool.lnk', targetPath: p('Elsewhere', 'Random Tool', 'tool.exe'), args: '', workingDir: '' }
    ],
    includeRegistry: true,
    includeLaunchers: true,
    cache: {}
  }

  output = await runScan(input, undefined, undefined, {
    readRegistry: async () => [
      { displayName: 'Registry Game Deluxe', installLocation: p('Elsewhere', 'Registry Game'), displayIcon: null, publisher: null }
    ],
    readSteam: async () => [
      { source: 'steam', title: 'Portal 2', installPath: p('SteamLib', 'Portal 2'), launch: { type: 'uri', uri: 'steam://rungameid/620' } }
    ],
    readEpic: async () => []
  })
})

afterAll(() => dir.cleanup())

function titles(): string[] {
  return output.games.map((game) => game.title).sort()
}

function game(title: string) {
  const found = output.games.find((item) => item.title === title)
  if (!found) throw new Error(`Game "${title}" not found. Found: ${titles().join(', ')}`)
  return found
}

describe('runScan', () => {
  it('finds every game and nothing else', () => {
    expect(titles()).toEqual(
      [
        'Balatro',
        'Celeste',
        'Game A',
        'Game B',
        'Hades II',
        'Hollow Knight',
        'Portal 2',
        'Registry Game Deluxe',
        'S.T.A.L.K.E.R. 2',
        'Shortcut Game'
      ].sort()
    )
  })

  it('uses the inner folder of a doubled folder', () => {
    expect(game('Balatro').installPath).toBe(p('Games', 'Balatro', 'Balatro'))
  })

  it('reports repack installers separately', () => {
    expect(output.installers.map((installer) => installer.title)).toEqual(['Elden Ring'])
  })

  it('detects the engine and picks the right executable', () => {
    const stalker = game('S.T.A.L.K.E.R. 2')
    expect(stalker.engine).toBe('unreal')
    expect(stalker.launch).toMatchObject({ type: 'exe', exePath: p('Games', 'S.T.A.L.K.E.R. 2 [FitGirl Repack]', 'Stalker2.exe') })
  })

  it('uses registry names and marks the source', () => {
    const registryGame = game('Registry Game Deluxe')
    expect(registryGame.sources).toContain('registry')
    expect(registryGame.searchTitle).toBe('Registry Game')
  })

  it('finds games through desktop shortcuts and keeps their arguments', () => {
    const shortcutGame = game('Shortcut Game')
    expect(shortcutGame.installPath).toBe(p('Elsewhere', 'Shortcut Game'))
    expect(shortcutGame.sources).toContain('shortcut')
    expect(shortcutGame.launch).toMatchObject({ type: 'exe', args: '-windowed' })
  })

  it('launches launcher games through their launcher', () => {
    expect(game('Portal 2').launch).toEqual({ type: 'uri', uri: 'steam://rungameid/620' })
  })

  it('records unreachable locations without failing', () => {
    expect(output.reachableRoots).not.toContain(p('Missing Drive'))
    expect(output.errors.some((error) => error.path === p('Missing Drive'))).toBe(true)
  })

  it('reuses cached folder sizes on the next scan', async () => {
    const key = Object.keys(output.cache)[0]!
    const tampered = { ...output.cache, [key]: { ...output.cache[key]!, sizeBytes: 123 } }
    const second = await runScan(
      { roots: [{ path: p('Games'), category: 'games' }], shortcuts: [], includeRegistry: false, includeLaunchers: false, cache: tampered },
      undefined,
      undefined,
      noSources
    )
    const all = [...second.games.map((item) => item.sizeBytes), ...second.installers.map((item) => item.sizeBytes)]
    expect(all).toContain(123)
  })

  it('can be cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      runScan({ roots: [{ path: p('Games'), category: 'games' }], shortcuts: [], includeRegistry: false, includeLaunchers: false, cache: {} }, undefined, controller.signal, noSources)
    ).rejects.toBeInstanceOf(ScanCancelledError)
  })

  it('accepts a location that is itself a single game', async () => {
    const single = await runScan(
      { roots: [{ path: p('Games', 'Hollow Knight'), category: 'games' }], shortcuts: [], includeRegistry: false, includeLaunchers: false, cache: {} },
      undefined,
      undefined,
      noSources
    )
    expect(single.games.map((item) => item.title)).toEqual(['Hollow Knight'])
  })
})

describe('gameFolderForExe', () => {
  const none = async () => false
  it('climbs out of binary folders', async () => {
    expect(await gameFolderForExe('D:\\Games\\Foo\\bin\\x64\\foo.exe', none)).toBe('D:\\Games\\Foo')
  })

  it('uses the Unreal game root when Engine sits next to the project', async () => {
    const hasEngine = async (target: string) => target === 'D:\\Games\\Foo\\Engine'
    expect(await gameFolderForExe('D:\\Games\\Foo\\FooGame\\Binaries\\Win64\\FooGame-Win64-Shipping.exe', hasEngine)).toBe('D:\\Games\\Foo')
  })

  it('never returns a container folder', async () => {
    expect(await gameFolderForExe('C:\\Program Files\\tool.exe', none)).toBeNull()
  })
})
