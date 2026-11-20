import path from 'node:path'
import type { Game } from '@shared/types'
import type { Repository } from '../db/repository'
import { log } from '../logger'
import { runCommand, runPowerShell } from '../scanner/sources/registry'

/** How often running processes are checked. */
const POLL_INTERVAL_MS = 10_000
/** Time a game gets to show up after launch (launchers, splash screens, UAC prompts). */
const STARTUP_GRACE_MS = 3 * 60_000
/**
 * After the session starts, a launcher may hand over to the real game executable.
 * During this window the tracked executable can switch; afterwards it is fixed.
 */
const HANDOFF_WINDOW_MS = 3 * 60_000
/** Minecraft gets longer: the launcher stays open while the user logs in, picks a version and downloads it. */
const MINECRAFT_STARTUP_GRACE_MS = 30 * 60_000
/** Process name used for Minecraft game processes found by their command line. */
const MINECRAFT_PROCESS = 'minecraft'
/** Consecutive polls without the game before the session is over. */
const MISSES_TO_STOP = 2

export interface RunningProcess {
  name: string
  pid: number
}

interface TrackedGame {
  gameId: number
  title: string
  /** Every executable of the game, as found by the scan. Used to notice the game starting. */
  candidateNames: Set<string>
  /** The executable that was launched, when Orus launched one directly. */
  launchName: string | null
  /** Processes that were already running before the launch. They never count as the game. */
  baselinePids: Set<number>
  /** Executables that make up the running game. The session lasts while one of them runs. */
  mainNames: Set<string>
  launchedAt: number
  /** Minecraft runs on Java like its launcher, so it is recognised by its command line instead of its name. */
  minecraft: boolean
  sessionId: number | null
  sessionStartedAt: number | null
  misses: number
}

/** Image names and PIDs from `tasklist /fo csv /nh`. Works without admin rights, even for elevated games. */
export function parseTasklist(output: string): RunningProcess[] {
  const processes: RunningProcess[] = []
  for (const line of output.split(/\r?\n/)) {
    const match = /^"([^"]+)","(\d+)"/.exec(line.trim())
    if (match) processes.push({ name: match[1]!.toLowerCase(), pid: Number(match[2]) })
  }
  return processes
}

function exeName(filePath: string): string {
  return path.win32.basename(filePath).toLowerCase()
}

/** Every executable that may be the running game: the launch target plus the other candidates found by the scan. */
export function processNamesFor(game: Pick<Game, 'launch' | 'exeCandidates'>): Set<string> {
  const names = new Set<string>()
  if (game.launch?.type === 'exe') names.add(exeName(game.launch.exePath))
  for (const candidate of game.exeCandidates) names.add(exeName(candidate.path))
  return names
}

/**
 * Java processes that are the Minecraft game (not a launcher), from "pid|command line" lines.
 * The game always gets --gameDir/--assetsDir or a Minecraft main class; SKlauncher runs as "-jar SKlauncher.jar".
 */
export function parseMinecraftProcesses(output: string): number[] {
  const pids: number[] = []
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf('|')
    if (separator <= 0) continue
    const pid = Number(line.slice(0, separator).trim())
    const commandLine = line.slice(separator + 1)
    if (!Number.isInteger(pid) || /sklauncher\.jar|minecraftlauncher/i.test(commandLine)) continue
    if (/--gameDir|--assetsDir|net\.minecraft|net\.fabricmc|cpw\.mods|net\.minecraftforge|org\.quiltmc/i.test(commandLine)) pids.push(pid)
  }
  return pids
}

export async function listMinecraftProcesses(): Promise<number[]> {
  if (process.platform !== 'win32') return []
  const script = "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^javaw?\\.exe$' } | ForEach-Object { '{0}|{1}' -f $_.ProcessId, $_.CommandLine }"
  return parseMinecraftProcesses(await runPowerShell(script, 20_000))
}

export function isMinecraft(game: Pick<Game, 'sources'>): boolean {
  return game.sources?.includes('minecraft') === true
}

export async function listRunningProcesses(): Promise<RunningProcess[]> {
  if (process.platform !== 'win32') return []
  return parseTasklist(await runCommand('tasklist.exe', ['/fo', 'csv', '/nh'], 15_000))
}

/**
 * Measures play time. After a launch it watches the process list:
 *
 * 1. The session starts when one of the game's executables appears. Processes that were
 *    already running before the launch are ignored.
 * 2. It then follows only the executable that actually runs the game: the launched one,
 *    or, if a launcher hands over to another executable in the first minutes, that one.
 *    Helpers that stay open in the background do not keep the session alive.
 * 3. The session ends when that executable is gone for two checks in a row.
 *
 * Sessions are saved on every check, so closing Orus mid-game loses almost nothing.
 */
export class PlaytimeTracker {
  private readonly tracked = new Map<number, TrackedGame>()
  private timer: NodeJS.Timeout | null = null
  private polling = false

  constructor(
    private readonly repository: Repository,
    private readonly onChange: (runningGameIds: number[]) => void,
    private readonly listProcesses: () => Promise<RunningProcess[]> = listRunningProcesses,
    private readonly listMinecraft: () => Promise<number[]> = listMinecraftProcesses
  ) {}

  private async minecraftProcesses(): Promise<RunningProcess[]> {
    return (await this.listMinecraft()).map((pid) => ({ name: MINECRAFT_PROCESS, pid }))
  }

  runningGameIds(): number[] {
    return [...this.tracked.values()].filter((entry) => entry.sessionId !== null).map((entry) => entry.gameId)
  }

  /** Starts watching a game that was just launched. */
  async track(game: Game, now = Date.now()): Promise<void> {
    const minecraft = isMinecraft(game)
    const candidateNames = minecraft ? new Set([MINECRAFT_PROCESS]) : processNamesFor(game)
    if (candidateNames.size === 0 || this.tracked.has(game.id)) return

    let baseline: RunningProcess[] = []
    try {
      baseline = minecraft ? await this.minecraftProcesses() : await this.listProcesses()
    } catch {
      baseline = []
    }

    this.tracked.set(game.id, {
      gameId: game.id,
      title: game.title,
      candidateNames,
      launchName: !minecraft && game.launch?.type === 'exe' ? exeName(game.launch.exePath) : null,
      minecraft,
      baselinePids: new Set(baseline.filter((process) => candidateNames.has(process.name)).map((process) => process.pid)),
      mainNames: new Set(),
      launchedAt: now,
      sessionId: null,
      sessionStartedAt: null,
      misses: 0
    })
    this.ensureTimer()
  }

  /** Forgets a game that failed to launch. Sessions already recorded are kept. */
  untrack(gameId: number): void {
    const entry = this.tracked.get(gameId)
    if (entry && entry.sessionId === null) this.tracked.delete(gameId)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private ensureTimer(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
    setTimeout(() => void this.poll(), 4000)
  }

  async poll(now = Date.now()): Promise<void> {
    if (this.tracked.size === 0 || this.polling) return
    this.polling = true
    try {
      await this.pollOnce(now)
    } finally {
      this.polling = false
    }
  }

  private async pollOnce(now: number): Promise<void> {
    let running: RunningProcess[]
    try {
      const entries = [...this.tracked.values()]
      running = entries.some((entry) => !entry.minecraft) ? await this.listProcesses() : []
      if (entries.some((entry) => entry.minecraft)) running = [...running, ...(await this.minecraftProcesses())]
    } catch (error) {
      log.warn('Could not read the process list', error)
      return
    }

    let changed = false
    for (const entry of [...this.tracked.values()]) {
      const fresh = running.filter((process) => !entry.baselinePids.has(process.pid))
      const candidates = fresh.filter((process) => entry.candidateNames.has(process.name))

      if (entry.sessionId === null) {
        if (candidates.length === 0) {
          // Not started yet. Give up after the grace period without recording anything.
          const grace = entry.minecraft ? MINECRAFT_STARTUP_GRACE_MS : STARTUP_GRACE_MS
          if (now - entry.launchedAt > grace) {
            log.info(`"${entry.title}" did not start within ${grace / 60_000} minutes; not tracking it`)
            this.tracked.delete(entry.gameId)
          }
          continue
        }
        entry.mainNames = this.pickMainNames(entry, candidates)
        entry.sessionStartedAt = entry.launchedAt
        entry.sessionId = this.repository.startSession(entry.gameId, new Date(entry.launchedAt).toISOString())
        log.info(`Play session started for "${entry.title}", following ${[...entry.mainNames].join(', ')}`)
        changed = true
      }

      let alive = fresh.some((process) => entry.mainNames.has(process.name))

      // A launcher that closed after starting the real game: follow the game instead.
      if (!alive && candidates.length > 0 && now - entry.sessionStartedAt! <= HANDOFF_WINDOW_MS) {
        entry.mainNames = new Set(candidates.map((process) => process.name))
        log.info(`"${entry.title}" handed over to ${[...entry.mainNames].join(', ')}`)
        alive = true
      }

      if (alive) {
        entry.misses = 0
        this.repository.extendSession(entry.sessionId!, new Date(now).toISOString(), (now - entry.sessionStartedAt!) / 1000)
        continue
      }

      entry.misses++
      if (entry.misses >= MISSES_TO_STOP) {
        log.info(`Play session ended for "${entry.title}"`)
        this.tracked.delete(entry.gameId)
        changed = true
      }
    }

    if (this.tracked.size === 0) this.stop()
    if (changed) this.onChange(this.runningGameIds())
  }

  /** The launched executable when it is running; otherwise whatever candidates appeared. */
  private pickMainNames(entry: TrackedGame, candidates: RunningProcess[]): Set<string> {
    if (entry.launchName && candidates.some((process) => process.name === entry.launchName)) return new Set([entry.launchName])
    return new Set(candidates.map((process) => process.name))
  }
}
