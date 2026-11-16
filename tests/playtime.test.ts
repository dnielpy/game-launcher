import { describe, expect, it, vi } from 'vitest'
import type { Game } from '../src/shared/types'
import type { Repository } from '../src/main/db/repository'
import { parseTasklist, PlaytimeTracker, processNamesFor, type RunningProcess } from '../src/main/services/playtime'

vi.mock('../src/main/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

function fakeRepository() {
  const sessions = new Map<number, { gameId: number; seconds: number }>()
  let nextId = 1
  const repository = {
    startSession: (gameId: number) => {
      const id = nextId++
      sessions.set(id, { gameId, seconds: 0 })
      return id
    },
    extendSession: (id: number, _endedAt: string, seconds: number) => {
      sessions.get(id)!.seconds = Math.round(seconds)
    }
  }
  return { repository: repository as unknown as Repository, sessions }
}

function gameWith(exe: string, others: string[] = []): Game {
  const dir = 'D:\\Games\\Some Game'
  return {
    id: 7,
    title: 'Some Game',
    launch: { type: 'exe', exePath: `${dir}\\${exe}`, args: '', workingDir: dir },
    exeCandidates: [exe, ...others].map((name) => ({ path: `${dir}\\${name}`, score: 1, sizeBytes: 1 }))
  } as unknown as Game
}

const proc = (name: string, pid: number): RunningProcess => ({ name, pid })

/** Drives a tracker with a scripted process list. */
function setup(game: Game, initial: RunningProcess[] = []) {
  const { repository, sessions } = fakeRepository()
  let running = initial
  const changes: number[][] = []
  const tracker = new PlaytimeTracker(repository, (ids) => changes.push(ids), async () => running)
  return {
    tracker,
    sessions,
    changes,
    set: (processes: RunningProcess[]) => {
      running = processes
    },
    start: (time: number) => tracker.track(game, time)
  }
}

describe('parseTasklist', () => {
  it('reads image names and PIDs from CSV output', () => {
    const output = '"System Idle Process","0","Services","0","8 K"\r\n"Celeste.exe","4242","Console","1","500,000 K"\r\n'
    expect(parseTasklist(output)).toEqual([proc('system idle process', 0), proc('celeste.exe', 4242)])
  })
})

describe('processNamesFor', () => {
  it('collects every candidate executable', () => {
    expect(processNamesFor(gameWith('Celeste.exe'))).toEqual(new Set(['celeste.exe']))
  })
})

describe('PlaytimeTracker', () => {
  const T = 1_000_000

  it('records a session from launch until the game closes', async () => {
    const run = setup(gameWith('Celeste.exe'))
    await run.start(T)
    run.set([proc('celeste.exe', 10)])
    await run.tracker.poll(T + 10_000)
    await run.tracker.poll(T + 600_000)
    expect(run.tracker.runningGameIds()).toEqual([7])

    run.set([])
    await run.tracker.poll(T + 610_000)
    await run.tracker.poll(T + 620_000)
    expect([...run.sessions.values()]).toEqual([{ gameId: 7, seconds: 600 }])
    expect(run.changes).toEqual([[7], []])
    expect(run.tracker.runningGameIds()).toEqual([])
  })

  it('stops when the game closes even if a helper from its folder stays open', async () => {
    const run = setup(gameWith('Game.exe', ['CrashUploader.exe']))
    await run.start(T)
    run.set([proc('game.exe', 10), proc('crashuploader.exe', 11)])
    await run.tracker.poll(T + 10_000)
    await run.tracker.poll(T + 3_600_000)

    run.set([proc('crashuploader.exe', 11)])
    await run.tracker.poll(T + 3_610_000)
    await run.tracker.poll(T + 3_620_000)
    await run.tracker.poll(T + 7_200_000)
    expect([...run.sessions.values()]).toEqual([{ gameId: 7, seconds: 3600 }])
    expect(run.tracker.runningGameIds()).toEqual([])
  })

  it('ignores a copy of the program that was already running before the launch', async () => {
    const run = setup(gameWith('Launcher.exe'), [proc('launcher.exe', 99)])
    await run.start(T)
    await run.tracker.poll(T + 10_000)
    await run.tracker.poll(T + 4 * 60_000)
    expect(run.sessions.size).toBe(0)
  })

  it('follows the real game when the launcher hands over and closes', async () => {
    const run = setup(gameWith('PlayGame.exe', ['Game_x64.exe']))
    await run.start(T)
    run.set([proc('playgame.exe', 10)])
    await run.tracker.poll(T + 10_000)
    run.set([proc('game_x64.exe', 11)])
    await run.tracker.poll(T + 20_000)
    await run.tracker.poll(T + 1_800_000)
    run.set([])
    await run.tracker.poll(T + 1_810_000)
    await run.tracker.poll(T + 1_820_000)
    expect([...run.sessions.values()]).toEqual([{ gameId: 7, seconds: 1800 }])
  })

  it('records nothing when the game never starts', async () => {
    const run = setup(gameWith('Celeste.exe'))
    await run.start(T)
    await run.tracker.poll(T + 4 * 60_000)
    expect(run.sessions.size).toBe(0)
    expect(run.tracker.runningGameIds()).toEqual([])
  })
})
