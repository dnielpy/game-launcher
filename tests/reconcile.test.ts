import { describe, expect, it } from 'vitest'
import { reconcile, type StoredGame } from '../src/main/scanner/reconcile'
import type { ScanCandidate } from '../src/main/scanner/types'

function candidate(installPath: string, exe: string, size = 1000): ScanCandidate {
  const exePath = `${installPath}\\${exe}`
  return {
    installPath,
    folderName: installPath.split('\\').pop()!,
    title: 'Game',
    searchTitle: 'Game',
    sources: ['folder'],
    engine: 'unknown',
    confidence: 80,
    needsReview: false,
    launch: { type: 'exe', exePath, args: '', workingDir: installPath },
    exeCandidates: [{ path: exePath, score: 50, sizeBytes: size }],
    sizeBytes: 5000
  }
}

function stored(id: number, installPath: string, exe: string, size = 1000, status: StoredGame['status'] = 'installed'): StoredGame {
  return {
    id,
    installPath,
    folderName: installPath.split('\\').pop()!,
    status,
    launch: { type: 'exe', exePath: `${installPath}\\${exe}`, args: '', workingDir: installPath },
    exeSizeBytes: size,
    manualFields: []
  }
}

const allReachable = () => true

describe('reconcile', () => {
  it('updates games found at the same path, ignoring case', () => {
    const plan = reconcile([stored(1, 'C:\\Games\\Celeste', 'Celeste.exe')], [candidate('c:\\games\\celeste', 'Celeste.exe')], allReachable)
    expect(plan.updates.map((update) => update.id)).toEqual([1])
    expect(plan.inserts).toHaveLength(0)
  })

  it('inserts new games', () => {
    const plan = reconcile([], [candidate('C:\\Games\\Celeste', 'Celeste.exe')], allReachable)
    expect(plan.inserts).toHaveLength(1)
  })

  it('relinks a game that moved to another drive instead of duplicating it', () => {
    const plan = reconcile(
      [stored(1, 'C:\\Games\\Celeste', 'Celeste.exe', 4242)],
      [candidate('D:\\Juegos\\Celeste', 'Celeste.exe', 4242)],
      allReachable
    )
    expect(plan.relinks.map((relink) => relink.id)).toEqual([1])
    expect(plan.inserts).toHaveLength(0)
    expect(plan.missing).toHaveLength(0)
  })

  it('marks games missing when their drive is reachable but the folder is gone', () => {
    const plan = reconcile([stored(1, 'C:\\Games\\Old', 'old.exe')], [], allReachable)
    expect(plan.missing).toEqual([1])
  })

  it('marks games on a disconnected drive as unavailable, not missing', () => {
    const plan = reconcile([stored(1, 'E:\\Games\\Old', 'old.exe')], [], (target) => !target.startsWith('E:'))
    expect(plan.unavailable).toEqual([1])
    expect(plan.missing).toEqual([])
  })

  it('does not report a status that is already set', () => {
    const plan = reconcile([stored(1, 'C:\\Games\\Old', 'old.exe', 1000, 'missing')], [], allReachable)
    expect(plan.missing).toEqual([])
  })
})
