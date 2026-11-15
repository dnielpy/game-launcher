import { promises as fs, type Dirent } from 'node:fs'
import path from 'node:path'

export const DEFAULT_FS_TIMEOUT_MS = 8000

export class FsTimeoutError extends Error {
  constructor(target: string) {
    super(`Timed out while reading ${target}`)
    this.name = 'FsTimeoutError'
  }
}

/** Rejects when the promise takes too long. Protects the scan from hung network drives. */
export async function withTimeout<T>(promise: Promise<T>, target: string, ms = DEFAULT_FS_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FsTimeoutError(target)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function readDirSafe(dir: string): Promise<Dirent[]> {
  return withTimeout(fs.readdir(dir, { withFileTypes: true }), dir)
}

export async function pathExists(target: string, timeoutMs = 3000): Promise<boolean> {
  try {
    await withTimeout(fs.access(target), target, timeoutMs)
    return true
  } catch {
    return false
  }
}

export async function isDirectory(target: string): Promise<boolean> {
  try {
    const stat = await withTimeout(fs.stat(target), target)
    return stat.isDirectory()
  } catch {
    return false
  }
}

export async function fileSize(target: string): Promise<number> {
  try {
    const stat = await withTimeout(fs.stat(target), target)
    return stat.size
  } catch {
    return 0
  }
}

/** Resolves symlinks and junctions so the same folder is never visited twice. */
export async function realPathSafe(target: string): Promise<string> {
  try {
    return await withTimeout(fs.realpath(target), target)
  } catch {
    return target
  }
}

/** Normalized key used to compare paths: forward slashes, no trailing slash, case-insensitive on Windows. */
export function pathKey(target: string): string {
  let normalized = target.replace(/\\/g, '/').replace(/\/{2,}/g, '/')
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/, '')
  if (/^[a-zA-Z]:$/.test(normalized)) normalized += '/'
  const caseInsensitive = process.platform === 'win32' || /^[a-zA-Z]:/.test(normalized)
  return caseInsensitive ? normalized.toLowerCase() : normalized
}

export function isSameOrInside(child: string, parent: string): boolean {
  const c = pathKey(child)
  const p = pathKey(parent)
  if (c === p) return true
  const base = p.endsWith('/') ? p : p + '/'
  return c.startsWith(base)
}

export interface DirSizeOptions {
  maxEntries?: number
}

/**
 * Total size of a folder. Stops counting after maxEntries files so a huge folder
 * cannot stall the scan; the result is then a lower bound, which is enough for scoring.
 */
export async function directorySize(dir: string, options: DirSizeOptions = {}): Promise<number> {
  const maxEntries = options.maxEntries ?? 150_000
  let total = 0
  let visited = 0
  const stack = [dir]
  while (stack.length > 0 && visited < maxEntries) {
    const current = stack.pop()!
    let entries: Dirent[]
    try {
      entries = await readDirSafe(current)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (visited >= maxEntries) break
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile()) {
        visited++
        total += await fileSize(full)
      }
    }
  }
  return total
}
