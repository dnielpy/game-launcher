import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findMinecraft, isMinecraftLauncherPath } from '../src/main/scanner/sources/minecraft'
import { isMinecraft, parseMinecraftProcesses, PlaytimeTracker, type RunningProcess } from '../src/main/services/playtime'
import type { Game } from '../src/shared/types'
import { createTree, tempDir } from './fixtures'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

function home() {
  const dir = tempDir('minecraft-')
  cleanups.push(dir.cleanup)
  return dir.path
}

describe('findMinecraft', () => {
  it('uses the SKlauncher setup with its own Java', async () => {
    const root = home()
    const appData = path.join(root, 'AppData')
    createTree(appData, { '.minecraft': { 'options.txt': 'x' }, sklauncher: { 'SKlauncher.jar': 100, jre: { bin: { 'javaw.exe': 100 } } } })
    const found = await findMinecraft([], { appData })
    const jar = path.join(appData, 'sklauncher', 'SKlauncher.jar')
    expect(found).toMatchObject({ title: 'Minecraft', installPath: path.join(appData, '.minecraft'), sources: ['minecraft'], needsReview: false })
    expect(found?.launch).toEqual({ type: 'exe', exePath: path.join(appData, 'sklauncher', 'jre', 'bin', 'javaw.exe'), args: `-Xmx512M -jar "${jar}"`, workingDir: path.join(appData, 'sklauncher') })
  })

  it('prefers the SKlauncher shortcut, and finds a portable copy in Downloads', async () => {
    const root = home()
    const appData = path.join(root, 'AppData')
    const userProfile = path.join(root, 'User')
    createTree(appData, { '.minecraft': { 'options.txt': 'x' } })
    createTree(userProfile, { Downloads: { 'SKlauncher-3.2.exe': 100, 'other.exe': 1 } })
    const portable = await findMinecraft([], { appData, userProfile })
    expect(portable?.launch).toMatchObject({ exePath: path.join(userProfile, 'Downloads', 'SKlauncher-3.2.exe') })

    const javaw = path.join(root, 'javaw.exe')
    createTree(root, { 'javaw.exe': 1 })
    const viaShortcut = await findMinecraft([{ shortcutPath: 'C:\\Users\\x\\Desktop\\SKlauncher.lnk', targetPath: javaw, args: '-jar SKlauncher.jar', workingDir: root }], { appData, userProfile })
    expect(viaShortcut?.launch).toMatchObject({ exePath: javaw, args: '-jar SKlauncher.jar' })
    expect(viaShortcut?.exeCandidates).toHaveLength(2)
  })

  it('asks for a launcher when only the game folder exists, and adds nothing without Minecraft', async () => {
    const root = home()
    const appData = path.join(root, 'AppData')
    expect(await findMinecraft([], { appData })).toBeNull()
    createTree(appData, { '.minecraft': { 'options.txt': 'x' } })
    expect(await findMinecraft([], { appData })).toMatchObject({ launch: null, needsReview: true })
  })

  it('recognises SKlauncher files found by the folder scan', () => {
    expect(isMinecraftLauncherPath('D:\\Juegos\\SKlauncher')).toBe(true)
    expect(isMinecraftLauncherPath('C:\\Users\\x\\AppData\\Roaming\\sklauncher\\jre\\bin\\javaw.exe')).toBe(true)
    expect(isMinecraftLauncherPath('D:\\Juegos\\Terraria')).toBe(false)
  })
})

describe('Minecraft play time', () => {
  it('tells the game apart from its launcher by the command line', () => {
    const output = [
      '4100|"C:\\Users\\x\\AppData\\Roaming\\sklauncher\\jre\\bin\\javaw.exe" -Xmx512M -jar "C:\\Users\\x\\AppData\\Roaming\\sklauncher\\SKlauncher.jar"',
      '5200|"C:\\Java\\bin\\javaw.exe" -Xmx4G -cp a.jar net.minecraft.client.main.Main --username Steve --gameDir C:\\Users\\x\\AppData\\Roaming\\.minecraft',
      '6300|"C:\\Java\\bin\\javaw.exe" -jar some-other-app.jar',
      '7400|javaw.exe net.fabricmc.loader.impl.launch.knot.KnotClient --assetsDir x'
    ].join('\r\n')
    expect(parseMinecraftProcesses(output)).toEqual([5200, 7400])
  })

  it('counts while the game runs, not while only the launcher is open', async () => {
    const sessions: { id: number; seconds: number }[] = []
    const repository = {
      startSession: () => {
        sessions.push({ id: sessions.length + 1, seconds: 0 })
        return sessions.length
      },
      extendSession: (id: number, _end: string, seconds: number) => {
        sessions[id - 1]!.seconds = seconds
      }
    }
    let minecraftPids: number[] = []
    const tracker = new PlaytimeTracker(repository as never, () => {}, async () => [] as RunningProcess[], async () => minecraftPids)
    const game = { id: 1, title: 'Minecraft', sources: ['minecraft'], launch: null, exeCandidates: [] } as unknown as Game
    expect(isMinecraft(game)).toBe(true)

    const start = Date.parse('2026-11-17T20:00:00Z')
    await tracker.track(game, start)
    // Ten minutes in the launcher: nothing counted yet.
    await tracker.poll(start + 10 * 60_000)
    expect(sessions).toHaveLength(0)
    minecraftPids = [5200]
    await tracker.poll(start + 11 * 60_000)
    await tracker.poll(start + 41 * 60_000)
    expect(sessions).toHaveLength(1)
    minecraftPids = []
    await tracker.poll(start + 42 * 60_000)
    await tracker.poll(start + 43 * 60_000)
    expect(tracker.runningGameIds()).toEqual([])
    tracker.stop()
  })
})
