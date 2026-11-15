import { describe, expect, it, vi } from 'vitest'
import type { Game } from '../src/shared/types'
import type { Repository } from '../src/main/db/repository'
import { parseTasklist, PlaytimeTracker, processNamesFor } from '../src/main/services/playtime'

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

const game = {
  id: 7,
  launch: { type: 'exe', exePath: 'D:\\Games\\Celeste\\Celeste.exe', args: '', workingDir: 'D:\\Games\\Celeste' },
  exeCandidates: [{ path: 'D:\\Games\\Celeste\\Celeste.exe', score: 1, sizeBytes: 1 }]
} as unknown as Game

describe('parseTasklist', () => {
  it('reads image names from CSV output', () => {
    const output = '"System Idle Process","0","Services","0","8 K"\r\n"Celeste.exe","4242","Console","1","500,000 K"\r\n'
    expect(parseTasklist(output)).toEqual(new Set(['system idle process', 'celeste.exe']))
  })
})

describe('processNamesFor', () => {
  it('collects every candidate executable', () => {
    expect(processNamesFor(game)).toEqual(new Set(['celeste.exe']))
  })
})

describe('PlaytimeTracker', () => {
  it('records a session from launch until the game closes', async () => {
    const { repository, sessions } = fakeRepository()
    let running = new Set<string>()
    const changes: number[][] = []
    const tracker = new PlaytimeTracker(repository, (ids) => changes.push(ids), async () => running)

    const start = Date.now()
    tracker.track(game)
    running = new Set(['celeste.exe'])
    await tracker.poll(start + 10_000)
    await tracker.poll(start + 600_000)
    expect(tracker.runningGameIds()).toEqual([7])

    running = new Set()
    await tracker.poll(start + 610_000)
    await tracker.poll(start + 620_000)

    expect([...sessions.values()]).toEqual([{ gameId: 7, seconds: 600 }])
    expect(changes).toEqual([[7], []])
    tracker.stop()
  })

  it('records nothing when the game never starts', async () => {
    const { repository, sessions } = fakeRepository()
    const tracker = new PlaytimeTracker(repository, () => {}, async () => new Set())
    const start = Date.now()
    tracker.track(game)
    await tracker.poll(start + 4 * 60_000)
    expect(sessions.size).toBe(0)
    expect(tracker.runningGameIds()).toEqual([])
    tracker.stop()
  })
})
