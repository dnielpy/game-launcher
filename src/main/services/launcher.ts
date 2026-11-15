import { shell } from 'electron'
import { spawn } from 'node:child_process'
import type { Game } from '@shared/types'
import { log } from '../logger'

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

  await new Promise<void>((resolve, reject) => {
    const child = spawn(launch.exePath, splitArgs(launch.args), {
      cwd: launch.workingDir || undefined,
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    })
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
    child.once('error', async (error: NodeJS.ErrnoException) => {
      // EACCES / error 740: the exe asks for administrator rights. Let Windows handle the UAC prompt.
      log.warn(`Direct launch failed for ${launch.exePath}, falling back to the shell`, error.code)
      const shellError = await shell.openPath(launch.exePath)
      if (shellError) reject(new Error(shellError))
      else resolve()
    })
  })
}

export async function openGameFolder(game: Game): Promise<void> {
  const error = await shell.openPath(game.installPath)
  if (error) throw new Error(error)
}
