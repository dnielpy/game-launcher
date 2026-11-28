import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { LauncherEntry } from '../types'
import { pathExists, readDirSafe, withTimeout } from '../fsUtils'
import { readRegistryValue } from './registry'
import { parseVdf, vdfObject, vdfString } from './vdf'

/** Steam app ids that are tools or runtimes, not games. */
const NON_GAME_APP_IDS = new Set(['228980', '250820', '1070560', '1391110', '1628350', '1493710', '1826330', '2180100'])

export function libraryPathsFromVdf(content: string): string[] {
  const root = parseVdf(content)
  const folders = vdfObject(root['libraryfolders']) ?? root
  const paths: string[] = []
  for (const value of Object.values(folders)) {
    const entry = vdfObject(value)
    const libraryPath = entry ? vdfString(entry['path']) : typeof value === 'string' ? value : null
    if (libraryPath && !paths.includes(libraryPath)) paths.push(libraryPath)
  }
  return paths
}

export interface SteamManifest {
  appId: string
  name: string
  installDir: string
  fullyInstalled: boolean
}

export function parseAppManifest(content: string): SteamManifest | null {
  const root = parseVdf(content)
  const state = vdfObject(root['appstate'])
  if (!state) return null
  const appId = vdfString(state['appid'])
  const name = vdfString(state['name'])
  const installDir = vdfString(state['installdir'])
  if (!appId || !name || !installDir) return null
  const flags = Number(vdfString(state['stateflags']) ?? '0')
  // Bit 4 (value 4) = fully installed.
  return { appId, name, installDir, fullyInstalled: (flags & 4) === 4 }
}

async function findSteamRoot(): Promise<string | null> {
  const fromRegistry = await readRegistryValue('HKCU\\Software\\Valve\\Steam', 'SteamPath')
  const candidates = [
    fromRegistry,
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam'
  ].filter((candidate): candidate is string => Boolean(candidate))
  for (const candidate of candidates) {
    const normalized = path.normalize(candidate)
    if (await pathExists(path.join(normalized, 'steamapps'))) return normalized
  }
  return null
}

export async function readSteamLibrary(steamRoot?: string): Promise<LauncherEntry[]> {
  const root = steamRoot ?? (await findSteamRoot())
  if (!root) return []

  let libraries = [root]
  try {
    const content = await withTimeout(fs.readFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8'), 'libraryfolders.vdf')
    libraries = [...new Set([root, ...libraryPathsFromVdf(content).map((library) => path.normalize(library))])]
  } catch {
    // Old installs or a missing file: the main library still works.
  }

  const entries: LauncherEntry[] = []
  for (const library of libraries) {
    const steamapps = path.join(library, 'steamapps')
    let files: string[]
    try {
      files = (await readDirSafe(steamapps)).filter((entry) => entry.isFile()).map((entry) => entry.name)
    } catch {
      continue
    }
    for (const file of files) {
      if (!/^appmanifest_\d+\.acf$/i.test(file)) continue
      try {
        const manifest = parseAppManifest(await fs.readFile(path.join(steamapps, file), 'utf8'))
        if (!manifest || !manifest.fullyInstalled || NON_GAME_APP_IDS.has(manifest.appId)) continue
        entries.push({
          source: 'steam',
          title: manifest.name,
          installPath: path.join(steamapps, 'common', manifest.installDir),
          launch: { type: 'uri', uri: `steam://rungameid/${manifest.appId}` }
        })
      } catch {
        continue
      }
    }
  }
  return entries
}

const STEAM_COMMON = /[\\/]steamapps[\\/]common[\\/]([^\\/]+)/i

/**
 * The Steam app id of a game installed by Steam, found from its folder or executable.
 * Games such as Dota 2 lose their Steam connection when their exe is started directly,
 * so they have to go through Steam. Looks for:
 * 1. a path under <library>\\steamapps\\common\\<installdir>, matched against the library's appmanifest files;
 * 2. a steam_appid.txt next to the executable or in the game folder.
 */
export async function findSteamAppId(installPath: string, exePath?: string): Promise<string | null> {
  for (const target of [exePath, installPath]) {
    if (!target) continue
    const match = STEAM_COMMON.exec(target)
    if (!match) continue
    const steamappsDir = target.slice(0, match.index + '/steamapps'.length)
    const installDir = (match[1] ?? '').toLowerCase()
    let files: string[]
    try {
      files = (await readDirSafe(steamappsDir)).filter((entry) => entry.isFile()).map((entry) => entry.name)
    } catch {
      continue
    }
    for (const file of files) {
      if (!/^appmanifest_\d+\.acf$/i.test(file)) continue
      try {
        const manifest = parseAppManifest(await withTimeout(fs.readFile(path.join(steamappsDir, file), 'utf8'), file))
        if (manifest && manifest.installDir.toLowerCase() === installDir) return manifest.appId
      } catch {
        continue
      }
    }
  }

  const appIdFiles = [exePath ? path.join(path.dirname(exePath), 'steam_appid.txt') : null, path.join(installPath, 'steam_appid.txt')]
  for (const file of appIdFiles) {
    if (!file) continue
    try {
      const content = (await withTimeout(fs.readFile(file, 'utf8'), file)).trim()
      if (/^\d+$/.test(content)) return content
    } catch {
      continue
    }
  }
  return null
}

/** The steam:// address that starts a game through Steam, with its launch options when there are any. */
export function steamLaunchUri(appId: string, args = ''): string {
  const trimmed = args.trim()
  return trimmed.length > 0 ? `steam://run/${appId}//${encodeURIComponent(trimmed)}/` : `steam://rungameid/${appId}`
}
