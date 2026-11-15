import path from 'node:path'
import type { ExecutableCandidate, GameEngine } from '@shared/types'
import { executablePenalty } from './exclusions'
import { pathKey } from './fsUtils'
import type { InspectedExecutable } from './folderInspector'
import { nameSimilarity } from './similarity'

export interface PickContext {
  title: string
  folderName: string
  engine: GameEngine
  /** Executables that desktop / start menu shortcuts point to. Strongest signal. */
  shortcutTargets: string[]
  /** DisplayIcon from the uninstall registry entry, often the game exe. */
  registryIcon?: string
}

export interface PickResult {
  best: ExecutableCandidate | null
  candidates: ExecutableCandidate[]
  /** True when the top choices are too close to call. The user should confirm. */
  ambiguous: boolean
  /** True when the choice came from a shortcut or the registry. */
  anchored: boolean
}

/** Points below which two candidates are considered a tie. */
const AMBIGUITY_MARGIN = 12

function registryIconPath(icon: string | undefined): string | null {
  if (!icon) return null
  // DisplayIcon looks like "C:\Games\Foo\foo.exe,0" or "\"C:\...\foo.exe\"".
  const cleaned = icon.replace(/^"|"$/g, '').replace(/,\s*-?\d+$/, '').replace(/^"|"$/g, '')
  return cleaned.toLowerCase().endsWith('.exe') ? cleaned : null
}

function baseName(fileName: string): string {
  return fileName.replace(/\.exe$/i, '')
}

/** Strips Unreal suffixes: "Stalker2-Win64-Shipping" -> "Stalker2". */
function stripEngineSuffix(name: string): string {
  return name.replace(/-(win64|wingdk|win32)-shipping$/i, '').replace(/[-_](win64|x64|dx11|dx12|vulkan)$/i, '')
}

function scoreExecutable(exe: InspectedExecutable, context: PickContext, all: InspectedExecutable[]): number {
  const name = stripEngineSuffix(baseName(exe.fileName))
  let score = 0

  // Name similarity against the title and the folder name.
  const similarity = Math.max(nameSimilarity(name, context.title), nameSimilarity(name, context.folderName))
  score += Math.round(similarity * 45)

  // Shallow executables are usually the entry point.
  if (exe.depth === 0) score += 15
  else if (exe.depth === 1) score += 8
  else if (exe.depth === 2) score += 3

  // Common binary folders.
  if (/(^|\/)(bin|bin64|binaries|x64|win64|game)(\/|$)/.test(exe.relativeDir)) score += 5

  // Bigger binaries are more likely the actual game (log scale, capped).
  const megabytes = exe.sizeBytes / 1024 ** 2
  if (megabytes > 0) score += Math.min(15, Math.round(Math.log2(1 + megabytes) * 2))

  if (/^game$/i.test(name)) score += 5

  score -= executablePenalty(exe.fileName)

  if (context.engine === 'unreal') {
    const isShipping = /-shipping\.exe$/i.test(exe.fileName)
    if (isShipping) score += 10
    // Unreal ships a small bootstrap exe at the root that launches the shipping
    // binary with the right arguments. Prefer it when it matches the project name.
    if (exe.depth === 0) {
      const projectFolders = all
        .filter((other) => /-shipping\.exe$/i.test(other.fileName))
        .map((other) => other.relativeDir.split('/')[0])
      if (projectFolders.some((folder) => folder && nameSimilarity(name, folder) > 0.6)) score += 40
    }
  }

  return score
}

export function pickExecutable(executables: InspectedExecutable[], context: PickContext): PickResult {
  if (executables.length === 0) return { best: null, candidates: [], ambiguous: false, anchored: false }

  const shortcutKeys = new Set(context.shortcutTargets.map(pathKey))
  const iconPath = registryIconPath(context.registryIcon)
  const iconKey = iconPath ? pathKey(iconPath) : null

  const scored = executables.map((exe) => {
    let score = scoreExecutable(exe, context, executables)
    const key = pathKey(exe.path)
    if (shortcutKeys.has(key)) score += 100
    if (iconKey && key === iconKey) score += 80
    return { exe, score }
  })

  scored.sort((a, b) => b.score - a.score || a.exe.depth - b.exe.depth || b.exe.sizeBytes - a.exe.sizeBytes)

  const candidates: ExecutableCandidate[] = scored.map(({ exe, score }) => ({
    path: exe.path,
    score,
    sizeBytes: exe.sizeBytes
  }))

  const first = scored[0]!
  const second = scored[1]
  const firstKey = pathKey(first.exe.path)
  const anchored = shortcutKeys.has(firstKey) || (iconKey !== null && firstKey === iconKey)
  const ambiguous = !anchored && second !== undefined && first.score - second.score < AMBIGUITY_MARGIN

  return { best: candidates[0] ?? null, candidates: candidates.slice(0, 8), ambiguous, anchored }
}

export function workingDirFor(exePath: string): string {
  return path.dirname(exePath)
}
