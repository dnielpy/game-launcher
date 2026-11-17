import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ExecutableCandidate, Game, LaunchTarget } from '@shared/types'
import { pickExecutable } from '../scanner/executablePicker'
import { inspectFolder } from '../scanner/folderInspector'
import { fileSize, isDirectory, isSameOrInside } from '../scanner/fsUtils'

export interface RelocationPlan {
  installPath: string
  folderName: string
  launch: LaunchTarget | null
  exeCandidates: ExecutableCandidate[]
  needsReview: boolean
}

function normalize(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '')
}

/** Moves a path from the old install folder to the new one, keeping its position inside the folder. Null when it was outside. */
export function remapPath(file: string, oldRoot: string, newRoot: string): string | null {
  if (!isSameOrInside(file, oldRoot)) return null
  const relative = normalize(file).slice(normalize(oldRoot).length).split('/').filter(Boolean)
  return path.join(newRoot, ...relative)
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

/**
 * Works out what a game looks like in its new folder. Files keep their place inside the folder, so a game that
 * was only moved keeps its chosen executable and launch options. If they are not there, the folder is searched.
 */
export async function planRelocation(game: Game, newFolder: string): Promise<RelocationPlan> {
  if (!(await isDirectory(newFolder))) throw new Error('That is not a folder')

  const kept: ExecutableCandidate[] = []
  for (const candidate of game.exeCandidates) {
    const moved = remapPath(candidate.path, game.installPath, newFolder) ?? candidate.path
    if (await exists(moved)) kept.push({ ...candidate, path: moved, sizeBytes: (await fileSize(moved)) || candidate.sizeBytes })
  }

  let launch: LaunchTarget | null = game.launch
  let candidates = kept
  let needsReview = false

  if (game.launch?.type === 'exe') {
    const moved = remapPath(game.launch.exePath, game.installPath, newFolder) ?? game.launch.exePath
    if (await exists(moved)) {
      const oldDir = remapPath(game.launch.workingDir, game.installPath, newFolder)
      launch = { type: 'exe', exePath: moved, args: game.launch.args, workingDir: oldDir ?? path.dirname(moved) }
      if (!candidates.some((candidate) => candidate.path === moved)) candidates = [{ path: moved, score: 100, sizeBytes: await fileSize(moved) }, ...candidates]
    } else {
      launch = null
    }
  }

  if (game.launch?.type !== 'uri' && launch === null) {
    const inspection = await inspectFolder(newFolder)
    const picked = pickExecutable(inspection.executables, {
      title: game.searchTitle || game.title,
      folderName: path.basename(newFolder),
      engine: game.engine,
      shortcutTargets: []
    })
    if (!picked.best) throw new Error('Could not find the game in that folder. Pick the folder that contains its executable.')
    candidates = picked.candidates
    launch = { type: 'exe', exePath: picked.best.path, args: game.launch?.type === 'exe' ? game.launch.args : '', workingDir: path.dirname(picked.best.path) }
    needsReview = picked.ambiguous
  }

  return { installPath: newFolder, folderName: path.basename(newFolder), launch, exeCandidates: candidates, needsReview }
}
