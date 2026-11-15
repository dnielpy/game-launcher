import path from 'node:path'
import type { Dirent } from 'node:fs'
import { fileSize, readDirSafe } from './fsUtils'
import { isExcludedExecutable, isExcludedFolderName, isSupportFolderName } from './exclusions'

export interface InspectedExecutable {
  path: string
  fileName: string
  /** Folder depth relative to the inspected folder (0 = root). */
  depth: number
  /** Path of the containing folder relative to the inspected folder, with forward slashes, lower-case. */
  relativeDir: string
  sizeBytes: number
}

/** Everything the classifier needs, gathered in one bounded walk. */
export interface FolderInspection {
  path: string
  folderName: string
  rootFiles: string[]
  rootDirs: string[]
  executables: InspectedExecutable[]
  /** Lower-case file names of every DLL seen during the walk. */
  dlls: Set<string>
  /** Lower-case names of every folder seen during the walk (any depth). */
  folders: Set<string>
  archiveFiles: number
  binFiles: string[]
  hasSteamEmulatorConfig: boolean
  truncated: boolean
}

export interface InspectOptions {
  maxDepth?: number
  maxDirectories?: number
}

const ARCHIVE_EXTENSIONS = new Set([
  '.pak',
  '.arc',
  '.bnk',
  '.forge',
  '.vpk',
  '.big',
  '.rpf',
  '.cpk',
  '.wad',
  '.bdt',
  '.bhd',
  '.pck',
  '.assets',
  '.resource',
  '.resources',
  '.bundle',
  '.ucas',
  '.utoc',
  '.ba2',
  '.bsa',
  '.gcf',
  '.rgss3a',
  '.rgssad',
  '.xp3',
  '.npk',
  '.dat'
])

function lower(value: string): string {
  return value.toLowerCase()
}

/**
 * Walks a folder breadth-first up to maxDepth and collects game-related signals.
 * Support folders (redistributables, anti-cheat, installers) are noted but not
 * searched for executables.
 */
export async function inspectFolder(folder: string, options: InspectOptions = {}): Promise<FolderInspection> {
  const maxDepth = options.maxDepth ?? 4
  const maxDirectories = options.maxDirectories ?? 400

  const inspection: FolderInspection = {
    path: folder,
    folderName: path.basename(folder),
    rootFiles: [],
    rootDirs: [],
    executables: [],
    dlls: new Set(),
    folders: new Set(),
    archiveFiles: 0,
    binFiles: [],
    hasSteamEmulatorConfig: false,
    truncated: false
  }

  const queue: { dir: string; depth: number; relative: string; inSupport: boolean }[] = [
    { dir: folder, depth: 0, relative: '', inSupport: false }
  ]
  let visitedDirs = 0

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visitedDirs >= maxDirectories) {
      inspection.truncated = true
      break
    }
    visitedDirs++

    let entries: Dirent[]
    try {
      entries = await readDirSafe(current.dir)
    } catch {
      if (current.depth === 0) throw new Error(`Cannot read folder ${current.dir}`)
      continue
    }

    for (const entry of entries) {
      const name = entry.name
      const lowerName = lower(name)
      const fullPath = path.join(current.dir, name)

      if (entry.isDirectory()) {
        if (current.depth === 0) inspection.rootDirs.push(name)
        inspection.folders.add(lowerName)
        if (lowerName === 'steam_settings') inspection.hasSteamEmulatorConfig = true
        if (isExcludedFolderName(name)) continue
        if (current.depth + 1 > maxDepth) continue
        const relative = current.relative ? `${current.relative}/${lowerName}` : lowerName
        queue.push({
          dir: fullPath,
          depth: current.depth + 1,
          relative,
          inSupport: current.inSupport || isSupportFolderName(name)
        })
        continue
      }

      if (!entry.isFile()) continue
      if (current.depth === 0) inspection.rootFiles.push(name)

      const extension = path.extname(lowerName)
      if (extension === '.dll') {
        inspection.dlls.add(lowerName)
      } else if (ARCHIVE_EXTENSIONS.has(extension) && !lowerName.startsWith('unins')) {
        inspection.archiveFiles++
      } else if (extension === '.bin' && current.depth <= 1) {
        inspection.binFiles.push(lowerName)
      } else if (lowerName === 'steam_emu.ini' || lowerName === 'steam_interfaces.txt') {
        inspection.hasSteamEmulatorConfig = true
      } else if (extension === '.exe' && !current.inSupport && !isExcludedExecutable(name)) {
        inspection.executables.push({
          path: fullPath,
          fileName: name,
          depth: current.depth,
          relativeDir: current.relative,
          sizeBytes: await fileSize(fullPath)
        })
      }
    }
  }

  return inspection
}
