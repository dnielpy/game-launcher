import { promises as fs } from 'node:fs'
import path from 'node:path'

/** Emulators based on yuzu keep their settings in %APPDATA%\<name>\config\qt-config.ini. */
const YUZU_FAMILY = ['yuzu', 'suyu', 'sudachi', 'citron', 'eden', 'torzu']

/** Game folders listed in a yuzu-style qt-config.ini ("Paths\gamedirs\4\path=D:/Switch"). */
export function parseQtGameDirs(ini: string): string[] {
  const dirs: string[] = []
  for (const line of ini.split(/\r?\n/)) {
    const match = /^Paths\\gamedirs\\\d+\\path=(.+)$/.exec(line.trim())
    if (!match) continue
    const value = match[1]!.trim()
    // SDMC, UserNAND and SysNAND are the emulator's own storage, not folders.
    if (/^[a-z]:[\\/]/i.test(value) || value.startsWith('\\\\')) dirs.push(value.replace(/\//g, '\\'))
  }
  return dirs
}

/** Game folders listed in Ryujinx's Config.json ("game_dirs"). */
export function parseRyujinxGameDirs(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as { game_dirs?: unknown }
    return Array.isArray(parsed.game_dirs) ? parsed.game_dirs.filter((dir): dir is string => typeof dir === 'string' && dir.length > 0) : []
  } catch {
    return []
  }
}

/** Folders the user already set up in their Switch emulators, so games kept there are found too. */
export async function readSwitchEmulatorGameDirs(appData = process.env['APPDATA']): Promise<string[]> {
  if (!appData) return []
  const dirs: string[] = []
  for (const name of YUZU_FAMILY) {
    try {
      dirs.push(...parseQtGameDirs(await fs.readFile(path.join(appData, name, 'config', 'qt-config.ini'), 'utf8')))
    } catch {
      // Not installed.
    }
  }
  try {
    dirs.push(...parseRyujinxGameDirs(await fs.readFile(path.join(appData, 'Ryujinx', 'Config.json'), 'utf8')))
  } catch {
    // Not installed.
  }
  return [...new Set(dirs)]
}
