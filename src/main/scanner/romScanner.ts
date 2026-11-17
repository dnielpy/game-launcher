import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { EmulatedPlatform } from '@shared/types'
import { isExcludedFolderName } from './exclusions'
import { isSameOrInside, pathKey, readDirSafe } from './fsUtils'
import { cleanDisplayTitle, cleanSearchTitle, normalizeForComparison } from './nameCleaner'
import type { ScanCandidate } from './types'

/** File types that hold a whole console game. */
export const ROM_EXTENSIONS: Record<EmulatedPlatform, string[]> = {
  switch: ['.nsp', '.xci']
}

export const PLATFORM_NAMES: Record<EmulatedPlatform, string> = {
  switch: 'Nintendo Switch'
}

export interface ParsedRom {
  title: string
  searchTitle: string
  /** The 16-digit Switch title id, when the file name has one. */
  titleId: string | null
}

/** Words dump tools and uploaders add to Switch file names. */
const SWITCH_NOISE = /\b(nsp|xci|nsz|xcz|nsw|switch|nintendo switch|eshop|usa|eur|jpn|multi\d*|base game|base)\b/gi

/**
 * Reads a Switch file name such as "Super Mario Odyssey [0100000000010000][v0] (5.7 GB).nsp".
 * Returns null for updates and DLC: their title id does not end in 000, or the name says so.
 */
export function parseSwitchRomName(fileName: string): ParsedRom | null {
  const base = fileName.replace(/\.[^.]+$/, '')
  const idMatch = /\[([0-9a-f]{16})\]/i.exec(base)
  const titleId = idMatch ? idMatch[1]!.toUpperCase() : null
  if (titleId && !titleId.endsWith('000')) return null
  if (!titleId && /\b(update|upd|dlc|patch)\b/i.test(base)) return null

  const cleaned = base
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\bv\d+(\.\d+)*\b/gi, ' ')
    .replace(SWITCH_NOISE, ' ')
    .replace(/\s+[-–]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!cleaned) return null
  const title = cleanDisplayTitle(cleaned) || cleaned
  return { title, searchTitle: cleanSearchTitle(cleaned) || title, titleId }
}

export interface RomSearchOptions {
  excludePaths?: string[]
  maxDepth?: number
  maxDirectories?: number
  onDirectory?: (dir: string) => void
  isCancelled?: () => boolean
}

/**
 * Walks the given folders looking for console game files. Each base game becomes one library entry;
 * a game found twice (an .nsp and an .xci, or two copies) keeps the bigger file.
 */
export async function findRoms(dirs: string[], platforms: EmulatedPlatform[], options: RomSearchOptions = {}): Promise<ScanCandidate[]> {
  const maxDepth = options.maxDepth ?? 5
  const maxDirectories = options.maxDirectories ?? 20_000
  const excluded = options.excludePaths ?? []
  const extensions = new Map<string, EmulatedPlatform>()
  for (const platform of platforms) for (const extension of ROM_EXTENSIONS[platform]) extensions.set(extension, platform)
  if (extensions.size === 0) return []

  const found = new Map<string, ScanCandidate & { sizeBytes: number }>()
  const visited = new Set<string>()
  const queue = dirs.map((dir) => ({ dir, depth: 0 }))
  let directories = 0

  while (queue.length > 0 && directories < maxDirectories) {
    if (options.isCancelled?.()) break
    const { dir, depth } = queue.shift()!
    const key = pathKey(dir)
    if (visited.has(key) || excluded.some((path) => isSameOrInside(dir, path))) continue
    visited.add(key)
    directories++
    options.onDirectory?.(dir)

    let entries
    try {
      entries = await readDirSafe(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth < maxDepth && !isExcludedFolderName(entry.name)) queue.push({ dir: full, depth: depth + 1 })
        continue
      }
      const platform = extensions.get(path.extname(entry.name).toLowerCase())
      if (!platform || !entry.isFile() || excluded.some((path) => isSameOrInside(full, path))) continue
      const parsed = parseSwitchRomName(entry.name)
      if (!parsed) continue
      let sizeBytes = 0
      try {
        sizeBytes = (await fs.stat(full)).size
      } catch {
        continue
      }
      const identity = `${platform}:${parsed.titleId ?? normalizeForComparison(parsed.title)}`
      const previous = found.get(identity)
      if (previous && previous.sizeBytes >= sizeBytes) continue
      found.set(identity, {
        installPath: full,
        folderName: entry.name,
        title: parsed.title,
        searchTitle: parsed.searchTitle,
        sources: ['folder'],
        category: 'game',
        platform,
        engine: 'unknown',
        confidence: 90,
        needsReview: false,
        launch: { type: 'rom', romPath: full, platform },
        exeCandidates: [],
        sizeBytes
      })
    }
  }
  return [...found.values()]
}
