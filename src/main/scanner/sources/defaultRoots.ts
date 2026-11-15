import os from 'node:os'
import path from 'node:path'
import type { RootCategory } from '@shared/types'
import { isDirectory, pathExists } from '../fsUtils'

export interface DefaultRoot {
  path: string
  category: RootCategory
}

/** Folder names checked at the top of every drive. */
const GAME_FOLDER_NAMES = [
  'Games',
  'Juegos',
  'Jogos',
  'Jeux',
  'Spiele',
  'Giochi',
  'GOG Games',
  'GOG Galaxy\\Games',
  'Epic Games',
  'XboxGames',
  'Riot Games',
  'Ubisoft\\Ubisoft Game Launcher\\games',
  'EA Games',
  'SteamLibrary\\steamapps\\common',
  'Steam\\steamapps\\common',
  'FitGirl Repacks',
  'Repacks'
]

const NOISY_FOLDER_NAMES = ['Program Files', 'Program Files (x86)']

export async function listWindowsDrives(): Promise<string[]> {
  const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const checks = await Promise.all(
    letters.map(async (letter) => {
      const drive = `${letter}:\\`
      return (await pathExists(drive, 1500)) ? drive : null
    })
  )
  return checks.filter((drive): drive is string => drive !== null)
}

/**
 * Locations where games usually live. Only folders that exist are returned.
 * Program Files is included as a "noisy" root: games there need stronger evidence.
 */
export async function discoverDefaultRoots(): Promise<DefaultRoot[]> {
  const candidates: DefaultRoot[] = []

  if (process.platform === 'win32') {
    const drives = await listWindowsDrives()
    for (const drive of drives) {
      for (const name of GAME_FOLDER_NAMES) candidates.push({ path: path.win32.join(drive, name), category: 'games' })
      for (const name of NOISY_FOLDER_NAMES) candidates.push({ path: path.win32.join(drive, name), category: 'noisy' })
    }
    candidates.push({ path: path.join(os.homedir(), 'Games'), category: 'games' })
  } else {
    // Development on Linux / macOS: only the home Games folder.
    candidates.push({ path: path.join(os.homedir(), 'Games'), category: 'games' })
  }

  const existing = await Promise.all(candidates.map(async (candidate) => ((await isDirectory(candidate.path)) ? candidate : null)))
  return existing.filter((root): root is DefaultRoot => root !== null)
}
