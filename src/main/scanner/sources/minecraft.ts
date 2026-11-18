import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ExecutableCandidate, LaunchTarget } from '@shared/types'
import type { ResolvedShortcut, ScanCandidate } from '../types'

/**
 * Minecraft is not installed like other games: the game lives in %APPDATA%\.minecraft and starts from a launcher.
 * Orus adds one "Minecraft" entry that opens the launcher the user has, SKlauncher first, the official one second.
 */
export interface MinecraftEnvironment {
  appData?: string
  userProfile?: string
  programFilesX86?: string
}

export function minecraftEnvironment(): MinecraftEnvironment {
  return { appData: process.env['APPDATA'], userProfile: process.env['USERPROFILE'], programFilesX86: process.env['ProgramFiles(x86)'] }
}

const SKLAUNCHER = /sklauncher/i
const SKLAUNCHER_FILE = /^sklauncher.*\.(exe|jar)$/i

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function filesIn(dir: string, pattern: RegExp): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).filter((name) => pattern.test(name)).map((name) => path.join(dir, name))
  } catch {
    return []
  }
}

function exeTarget(exePath: string, args = '', workingDir = path.dirname(exePath)): LaunchTarget {
  return { type: 'exe', exePath, args, workingDir }
}

/** True for files and folders that belong to SKlauncher; folded into the Minecraft entry instead of listed apart. */
export function isMinecraftLauncherPath(target: string): boolean {
  return SKLAUNCHER.test(path.win32.basename(target)) || /[\\/]sklauncher[\\/]/i.test(target)
}

export async function findMinecraft(shortcuts: ResolvedShortcut[], env: MinecraftEnvironment = minecraftEnvironment()): Promise<ScanCandidate | null> {
  const launches: LaunchTarget[] = []

  // 1. The SKlauncher shortcut, exactly as its installer made it (bundled javaw + SKlauncher.jar).
  for (const shortcut of shortcuts) {
    if (SKLAUNCHER.test(shortcut.shortcutPath) || SKLAUNCHER.test(shortcut.targetPath) || SKLAUNCHER.test(shortcut.args)) {
      if (await exists(shortcut.targetPath)) launches.push(exeTarget(shortcut.targetPath, shortcut.args, shortcut.workingDir || path.dirname(shortcut.targetPath)))
    }
  }

  if (env.appData) {
    // 2. SKlauncher Setup: %APPDATA%\sklauncher\SKlauncher.jar with its own Java.
    const setupDir = path.join(env.appData, 'sklauncher')
    const jar = path.join(setupDir, 'SKlauncher.jar')
    const javaw = path.join(setupDir, 'jre', 'bin', 'javaw.exe')
    if ((await exists(jar)) && (await exists(javaw))) launches.push(exeTarget(javaw, `-Xmx512M -jar "${jar}"`, setupDir))
  }

  // 3. Portable SKlauncher (.exe or .jar) kept next to the game, on the desktop or in Downloads.
  const portableDirs = [env.appData && path.join(env.appData, '.minecraft'), env.userProfile && path.join(env.userProfile, 'Desktop'), env.userProfile && path.join(env.userProfile, 'Downloads')]
  for (const dir of portableDirs) {
    if (!dir) continue
    const found = (await filesIn(dir, SKLAUNCHER_FILE)).sort((a, b) => Number(/\.exe$/i.test(b)) - Number(/\.exe$/i.test(a)))
    for (const file of found) launches.push(exeTarget(file))
  }

  // 4. The official launcher.
  for (const shortcut of shortcuts) {
    if (/minecraftlauncher\.exe$/i.test(shortcut.targetPath) && (await exists(shortcut.targetPath))) launches.push(exeTarget(shortcut.targetPath, shortcut.args))
  }
  if (env.programFilesX86) {
    const official = path.join(env.programFilesX86, 'Minecraft Launcher', 'MinecraftLauncher.exe')
    if (await exists(official)) launches.push(exeTarget(official))
  }

  const gameDir = env.appData ? path.join(env.appData, '.minecraft') : null
  const hasGame = gameDir !== null && (await exists(gameDir))
  if (!hasGame && launches.length === 0) return null

  const unique = launches.filter((launch, index) => launch.type === 'exe' && launches.findIndex((other) => other.type === 'exe' && other.exePath.toLowerCase() === launch.exePath.toLowerCase()) === index)
  const exeCandidates: ExecutableCandidate[] = unique.map((launch, index) => ({ path: launch.type === 'exe' ? launch.exePath : '', score: 100 - index * 10, sizeBytes: 0 }))
  const launch = unique[0] ?? null

  return {
    installPath: hasGame ? gameDir! : launch && launch.type === 'exe' ? path.dirname(launch.exePath) : gameDir!,
    folderName: '.minecraft',
    title: 'Minecraft',
    searchTitle: 'Minecraft',
    sources: ['minecraft'],
    category: 'game',
    engine: 'unknown',
    confidence: 95,
    // Without a launcher Orus cannot start it; Manage lets the user pick one.
    needsReview: launch === null,
    launch,
    exeCandidates,
    sizeBytes: 0
  }
}
