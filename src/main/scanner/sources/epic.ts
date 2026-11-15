import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { LauncherEntry } from '../types'
import { readDirSafe } from '../fsUtils'

export const DEFAULT_EPIC_MANIFESTS_DIR = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'

interface EpicManifest {
  DisplayName?: string
  InstallLocation?: string
  LaunchExecutable?: string
  AppName?: string
  CatalogNamespace?: string
  CatalogItemId?: string
  AppCategories?: string[]
  bIsIncompleteInstall?: boolean
}

export function epicEntryFromManifest(manifest: EpicManifest): LauncherEntry | null {
  if (!manifest.DisplayName || !manifest.InstallLocation || !manifest.AppName) return null
  if (manifest.bIsIncompleteInstall) return null
  if (manifest.AppCategories && !manifest.AppCategories.some((category) => category.toLowerCase() === 'games')) return null

  const launchId =
    manifest.CatalogNamespace && manifest.CatalogItemId
      ? `${manifest.CatalogNamespace}%3A${manifest.CatalogItemId}%3A${manifest.AppName}`
      : manifest.AppName

  return {
    source: 'epic',
    title: manifest.DisplayName,
    installPath: path.win32.normalize(manifest.InstallLocation),
    launch: { type: 'uri', uri: `com.epicgames.launcher://apps/${launchId}?action=launch&silent=true` }
  }
}

export async function readEpicLibrary(manifestsDir = DEFAULT_EPIC_MANIFESTS_DIR): Promise<LauncherEntry[]> {
  let files: string[]
  try {
    files = (await readDirSafe(manifestsDir)).filter((entry) => entry.isFile() && entry.name.endsWith('.item')).map((entry) => entry.name)
  } catch {
    return []
  }
  const entries: LauncherEntry[] = []
  for (const file of files) {
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(manifestsDir, file), 'utf8')) as EpicManifest
      const entry = epicEntryFromManifest(manifest)
      if (entry) entries.push(entry)
    } catch {
      continue
    }
  }
  return entries
}
