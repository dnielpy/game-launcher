import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findRoms, parseSwitchRomName } from '../src/main/scanner/romScanner'
import { parseQtGameDirs, parseRyujinxGameDirs } from '../src/main/scanner/sources/switchEmulators'
import { romLaunchArgs, runsPlatform } from '../src/main/services/emulation'
import { parseSteamGridDbImages, parseSteamGridDbSearch } from '../src/main/metadata/steamGridDbClient'
import type { Game } from '../src/shared/types'
import { createTree, tempDir } from './fixtures'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

describe('parseSwitchRomName', () => {
  it('reads titles from common file names', () => {
    expect(parseSwitchRomName('Super Mario Odyssey [0100000000010000][v0] (5.7 GB).nsp')).toEqual({
      title: 'Super Mario Odyssey',
      searchTitle: 'Super Mario Odyssey',
      titleId: '0100000000010000'
    })
    expect(parseSwitchRomName('The_Legend_of_Zelda_Tears_of_the_Kingdom_NSP_v0.nsp')?.title).toBe('The Legend of Zelda Tears of the Kingdom')
    expect(parseSwitchRomName('Mario Kart 8 Deluxe (USA) [NSP].xci')?.title).toBe('Mario Kart 8 Deluxe')
  })

  it('skips updates and DLC', () => {
    expect(parseSwitchRomName('Super Mario Odyssey [0100000000010800][v786432].nsp')).toBeNull()
    expect(parseSwitchRomName('Mario Kart 8 Deluxe [0100152000023001][v0].nsp')).toBeNull()
    expect(parseSwitchRomName('Pokemon Scarlet Update 3.0.1.nsp')).toBeNull()
    expect(parseSwitchRomName('Pokemon Scarlet DLC.nsp')).toBeNull()
  })
})

describe('findRoms', () => {
  it('finds one entry per base game, keeping the biggest copy, and honours exclusions', async () => {
    const dir = tempDir('roms-')
    cleanups.push(dir.cleanup)
    createTree(dir.path, {
      Switch: {
        'Super Mario Odyssey [0100000000010000][v0].nsp': 5000,
        'Super Mario Odyssey [0100000000010000][v0].xci': 9000,
        'Super Mario Odyssey [0100000000010800][v786432].nsp': 300,
        Nested: { 'Celeste [01002B30028F6000][v0].nsp': 100 }
      },
      Skip: { 'Hades [0100535012974000][v0].nsp': 100 },
      'readme.txt': 'x'
    })
    const roms = await findRoms([dir.path], ['switch'], { excludePaths: [path.join(dir.path, 'Skip')] })
    const titles = roms.map((rom) => rom.title).sort()
    expect(titles).toEqual(['Celeste', 'Super Mario Odyssey'])
    const mario = roms.find((rom) => rom.title === 'Super Mario Odyssey')!
    expect(mario.installPath.endsWith('.xci')).toBe(true)
    expect(mario.platform).toBe('switch')
    expect(mario.launch).toEqual({ type: 'rom', romPath: mario.installPath, platform: 'switch' })
  })

  it('does nothing when no console is turned on', async () => {
    expect(await findRoms(['/nowhere'], [])).toEqual([])
  })
})

describe('Switch emulator settings', () => {
  it('reads game folders from yuzu-style and Ryujinx settings', () => {
    const ini = ['[UI]', 'Paths\\gamedirs\\1\\path=SDMC', 'Paths\\gamedirs\\2\\path=UserNAND', 'Paths\\gamedirs\\4\\path=D:/Switch Games', 'Paths\\gamedirs\\4\\deep_scan=false'].join('\r\n')
    expect(parseQtGameDirs(ini)).toEqual(['D:\\Switch Games'])
    expect(parseRyujinxGameDirs('{"game_dirs":["E:\\\\Roms\\\\Switch"],"other":1}')).toEqual(['E:\\Roms\\Switch'])
    expect(parseRyujinxGameDirs('not json')).toEqual([])
  })

  it('opens games full screen with yuzu forks and plainly with Ryujinx', () => {
    expect(romLaunchArgs('C:\\Emus\\yuzu\\yuzu.exe', 'D:\\a.nsp')).toEqual(['-f', '-g', 'D:\\a.nsp'])
    expect(romLaunchArgs('C:\\Emus\\citron\\citron.exe', 'D:\\a.nsp')).toEqual(['-f', '-g', 'D:\\a.nsp'])
    expect(romLaunchArgs('C:\\Emus\\Ryujinx\\Ryujinx.exe', 'D:\\a.nsp')).toEqual(['D:\\a.nsp'])
  })

  it('recognises Switch emulators', () => {
    const emulator = (title: string, exePath: string) => ({ title, launch: { type: 'exe', exePath, args: '', workingDir: '' } }) as Game
    expect(runsPlatform(emulator('Ryujinx', 'C:\\R\\Ryujinx.exe'), 'switch')).toBe(true)
    expect(runsPlatform(emulator('My emu', 'C:\\x\\sudachi.exe'), 'switch')).toBe(true)
    expect(runsPlatform(emulator('PCSX2', 'C:\\x\\pcsx2-qt.exe'), 'switch')).toBe(false)
  })
})

describe('SteamGridDB parsing', () => {
  it('reads search results and keeps safe images, best first', () => {
    expect(parseSteamGridDbSearch({ success: true, data: [{ id: 1, name: 'Celeste', release_date: 1516665600 }, { id: 'x' }] })).toEqual([
      { id: 1, name: 'Celeste', releaseYear: 2018 }
    ])
    const images = parseSteamGridDbImages({
      data: [
        { url: 'https://cdn2.steamgriddb.com/a.png', score: 1 },
        { url: 'https://cdn2.steamgriddb.com/b.png', score: 5 },
        { url: 'https://cdn2.steamgriddb.com/c.png', score: 9, nsfw: true },
        { url: 'https://cdn2.steamgriddb.com/d.png', score: 9, humor: true }
      ]
    })
    expect(images).toEqual(['https://cdn2.steamgriddb.com/b.png', 'https://cdn2.steamgriddb.com/a.png'])
  })
})
