import { shell } from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
import type { Game } from '@shared/types'
import { log } from '../logger'
import { findSteamAppId, steamLaunchUri } from '../scanner/sources/steam'

/** Splits a command-line argument string, keeping quoted parts together. */
export function splitArgs(args: string): string[] {
  const result: string[] = []
  const pattern = /"([^"]*)"|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(args)) !== null) result.push(match[1] ?? match[2] ?? '')
  return result
}

export async function launchGame(game: Game): Promise<void> {
  const launch = game.launch
  if (!launch) throw new Error('This game has no executable selected yet')

  if (launch.type === 'uri') {
    await shell.openExternal(launch.uri)
    return
  }
  if (launch.type === 'rom') throw new Error('Console games start through their emulator')

  const kind = launchKind(launch.exePath)
  if (kind === 'exe') {
    // Steam games started from their exe lose their Steam connection (Dota 2, for example): let Steam start them.
    const appId = await findSteamAppId(game.installPath, launch.exePath).catch(() => null)
    if (appId) {
      log.info(`Launching ${game.title} through Steam (app ${appId})`)
      await shell.openExternal(steamLaunchUri(appId, launch.args))
      return
    }
  }
  if (kind === 'script') {
    await spawnDetached('cmd.exe', ['/d', '/s', '/c', `"${batchCommand(launch.exePath, launch.args)}"`], launch.workingDir, true)
    return
  }
  if (kind === 'other') {
    // Shortcuts (.lnk, .url) and anything else: open it the way Explorer would.
    const error = await shell.openPath(launch.exePath)
    if (error) throw new Error(error)
    return
  }

  try {
    await spawnDetached(launch.exePath, splitArgs(launch.args), launch.workingDir, false)
  } catch (error) {
    // EACCES / error 740: the exe asks for administrator rights. Let Windows handle the UAC prompt.
    log.warn(`Direct launch failed for ${launch.exePath}, falling back to the shell`, (error as NodeJS.ErrnoException).code)
    const shellError = await shell.openPath(launch.exePath)
    if (shellError) throw new Error(shellError)
  }
}

/** Starts a program with the given arguments, without a shell. */
export async function launchExecutable(exePath: string, args: string[], workingDir: string): Promise<void> {
  await spawnDetached(exePath, args, workingDir, false)
}

export type LaunchKind = 'exe' | 'script' | 'other'

/** Batch files run through cmd.exe; executables start directly; anything else opens through the shell. */
export function launchKind(filePath: string): LaunchKind {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.exe' || extension === '.com') return 'exe'
  if (extension === '.bat' || extension === '.cmd') return 'script'
  return 'other'
}

/** The command line cmd.exe runs for a batch file: the quoted script path, then its arguments. */
export function batchCommand(scriptPath: string, args: string): string {
  const trimmed = args.trim()
  return trimmed.length > 0 ? `"${scriptPath}" ${trimmed}` : `"${scriptPath}"`
}

function spawnDetached(command: string, args: string[], workingDir: string, verbatim: boolean): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workingDir || undefined,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      windowsVerbatimArguments: verbatim
    })
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
    child.once('error', reject)
  })
}

export async function openGameFolder(game: Game): Promise<void> {
  const error = await shell.openPath(game.installPath)
  if (error) throw new Error(error)
}
