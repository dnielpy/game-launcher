import path from 'node:path'
import type { GameStatus, LaunchTarget, ManualField } from '@shared/types'
import { pathKey } from './fsUtils'
import type { ScanCandidate } from './types'

/** The parts of a stored game that matter when comparing against a new scan. */
export interface StoredGame {
  id: number
  installPath: string
  folderName: string
  status: GameStatus
  launch: LaunchTarget | null
  exeSizeBytes: number | null
  manualFields: ManualField[]
}

export interface ReconcilePlan {
  inserts: ScanCandidate[]
  /** Games found again at the same path. */
  updates: { id: number; candidate: ScanCandidate }[]
  /** Games that moved: same game, new folder. */
  relinks: { id: number; candidate: ScanCandidate }[]
  missing: number[]
  unavailable: number[]
}

function exeName(launch: LaunchTarget | null): string | null {
  return launch?.type === 'exe' ? path.win32.basename(launch.exePath).toLowerCase() : null
}

function candidateExe(candidate: ScanCandidate): { name: string; size: number } | null {
  if (candidate.launch?.type !== 'exe') return null
  const best = candidate.exeCandidates.find((exe) => pathKey(exe.path) === pathKey((candidate.launch as { exePath: string }).exePath))
  return { name: path.win32.basename(candidate.launch.exePath).toLowerCase(), size: best?.sizeBytes ?? 0 }
}

function isSameGame(stored: StoredGame, candidate: ScanCandidate): boolean {
  const storedExe = exeName(stored.launch)
  const found = candidateExe(candidate)
  if (storedExe && found && storedExe === found.name && stored.exeSizeBytes && stored.exeSizeBytes === found.size) {
    return true
  }
  return stored.folderName.toLowerCase() === candidate.folderName.toLowerCase() && storedExe !== null && found?.name === storedExe
}

/**
 * Decides what to do with every stored game after a scan.
 * Nothing is ever deleted here: games that disappear keep their history.
 */
export function reconcile(
  stored: StoredGame[],
  candidates: ScanCandidate[],
  isLocationReachable: (installPath: string) => boolean
): ReconcilePlan {
  const plan: ReconcilePlan = { inserts: [], updates: [], relinks: [], missing: [], unavailable: [] }
  const storedByPath = new Map(stored.map((game) => [pathKey(game.installPath), game]))
  const matchedIds = new Set<number>()
  const unmatchedCandidates: ScanCandidate[] = []

  for (const candidate of candidates) {
    const existing = storedByPath.get(pathKey(candidate.installPath))
    if (existing) {
      plan.updates.push({ id: existing.id, candidate })
      matchedIds.add(existing.id)
    } else {
      unmatchedCandidates.push(candidate)
    }
  }

  const lost = stored.filter((game) => !matchedIds.has(game.id))

  for (const candidate of unmatchedCandidates) {
    const moved = lost.find((game) => !matchedIds.has(game.id) && isSameGame(game, candidate))
    if (moved) {
      plan.relinks.push({ id: moved.id, candidate })
      matchedIds.add(moved.id)
    } else {
      plan.inserts.push(candidate)
    }
  }

  for (const game of stored) {
    if (matchedIds.has(game.id)) continue
    if (!isLocationReachable(game.installPath)) {
      if (game.status !== 'unavailable') plan.unavailable.push(game.id)
    } else if (game.status !== 'missing') {
      plan.missing.push(game.id)
    }
  }

  return plan
}
