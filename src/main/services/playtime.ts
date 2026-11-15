import path from 'node:path'
import type { Game } from '@shared/types'
import type { Repository } from '../db/repository'
import { log } from '../logger'
import { runCommand } from '../scanner/sources/registry'

/** How often running processes are checked. */
const POLL_INTERVAL_MS = 10_000
/** Time a game gets to show up after launch (launchers, splash screens, UAC prompts). */
const STARTUP_GRACE_MS = 3 * 60_000
/** Consecutive empty polls before a session is considered over. */
const MISSES_TO_STOP = 2

interface TrackedGame {
  gameId: number
  processNames: Set<string>
  launchedAt: number
  sessionId: number | null
  sessionStartedAt: number | null
  misses: number
}

/** Image names from `tasklist /fo csv /nh`. Works without admin rights, even for elevated games. */
export function parseTasklist(output: string): Set<string> {
  const names = new Set<string>()
  for (const line of output.split(/\r?\n/)) {
    const match = /^"([^"]+)"/.exec(line.trim())
    if (match) names.add(match[1]!.toLowerCase())
  }
  return names
}

/** Every executable that may be the running game: the launch target plus the other candidates found by the scan. */
export function processNamesFor(game: Pick<Game, 'launch' | 'exeCandidates'>): Set<string> {
  const names = new Set<string>()
  if (game.launch?.type === 'exe') names.add(path.win32.basename(game.launch.exePath).toLowerCase())
  for (const candidate of game.exeCandidates) names.add(path.win32.basename(candidate.path).toLowerCase())
  return names
}

export async function listRunningProcesses(): Promise<Set<string>> {
  if (process.platform !== 'win32') return new Set()
  return parseTasklist(await runCommand('tasklist.exe', ['/fo', 'csv', '/nh'], 15_000))
}

/**
 * Measures play time. After a launch it watches the process list; the session
 * starts when one of the game's executables appears and ends when they are all gone.
 * Sessions are saved on every poll, so closing the launcher loses almost nothing.
 */
export class PlaytimeTracker {
  private readonly tracked = new Map<number, TrackedGame>()
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly repository: Repository,
    private readonly onChange: (runningGameIds: number[]) => void,
    private readonly listProcesses: () => Promise<Set<string>> = listRunningProcesses
  ) {}

  runningGameIds(): number[] {
    return [...this.tracked.values()].filter((entry) => entry.sessionId !== null).map((entry) => entry.gameId)
  }

  track(game: Game): void {
    const processNames = processNamesFor(game)
    if (processNames.size === 0 || this.tracked.has(game.id)) return
    this.tracked.set(game.id, {
      gameId: game.id,
      processNames,
      launchedAt: Date.now(),
      sessionId: null,
      sessionStartedAt: null,
      misses: 0
    })
    this.ensureTimer()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    void this.poll()
  }

  private ensureTimer(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
    setTimeout(() => void this.poll(), 4000)
  }

  async poll(now = Date.now()): Promise<void> {
    if (this.tracked.size === 0) return
    let running: Set<string>
    try {
      running = await this.listProcesses()
    } catch (error) {
      log.warn('Could not read the process list', error)
      return
    }

    let changed = false
    for (const entry of [...this.tracked.values()]) {
      const alive = [...entry.processNames].some((name) => running.has(name))

      if (alive) {
        entry.misses = 0
        if (entry.sessionId === null) {
          entry.sessionStartedAt = entry.launchedAt
          entry.sessionId = this.repository.startSession(entry.gameId, new Date(entry.launchedAt).toISOString())
          changed = true
        }
        this.repository.extendSession(entry.sessionId, new Date(now).toISOString(), (now - entry.sessionStartedAt!) / 1000)
        continue
      }

      if (entry.sessionId === null) {
        // Not started yet. Give up after the grace period without recording anything.
        if (now - entry.launchedAt > STARTUP_GRACE_MS) this.tracked.delete(entry.gameId)
        continue
      }

      entry.misses++
      if (entry.misses >= MISSES_TO_STOP) {
        this.tracked.delete(entry.gameId)
        changed = true
      }
    }

    if (this.tracked.size === 0 && this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (changed) this.onChange(this.runningGameIds())
  }
}
