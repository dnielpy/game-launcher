import type { GameEngine, RootCategory } from '@shared/types'
import type { FolderInspection } from './folderInspector'
import { looksLikeUpdateName } from './nameCleaner'

export type FolderKind = 'game' | 'installer' | 'update' | 'none'

export interface ClassificationContext {
  category: RootCategory
  /** The folder sits directly inside a library root (e.g. D:\Games\<this>). */
  directChildOfRoot: boolean
  /** Extra points from other sources (registry entry, desktop shortcut...). */
  externalBonus?: number
}

export interface Signal {
  id: string
  points: number
}

export interface Classification {
  kind: FolderKind
  score: number
  threshold: number
  engine: GameEngine
  signals: Signal[]
  hasExecutables: boolean
}

/** Score needed to accept a folder as a game. */
export const THRESHOLDS: Record<RootCategory, number> = {
  games: 30,
  noisy: 60
}

const MIDDLEWARE_DLLS = new Set([
  'binkw32.dll',
  'binkw64.dll',
  'bink2w32.dll',
  'bink2w64.dll',
  'physxloader.dll',
  'physx3_x64.dll',
  'physx3_x86.dll',
  'physx3common_x64.dll',
  'physx_64.dll',
  'fmod.dll',
  'fmod64.dll',
  'fmodex.dll',
  'fmodex64.dll',
  'fmodstudio.dll',
  'openal32.dll',
  'xinput1_3.dll',
  'd3dx9_43.dll',
  'd3dcompiler_43.dll',
  'galaxy.dll',
  'galaxy64.dll',
  'eossdk-win64-shipping.dll',
  'eossdk-win32-shipping.dll',
  'discord_game_sdk.dll',
  'amd_ags_x64.dll',
  'nvngx_dlss.dll',
  'libxess.dll',
  'ffx_fsr2_api_x64.dll',
  'gfsdk_aftermath_lib.x64.dll',
  'sdl2.dll',
  'sdl3.dll',
  'wwise.dll',
  'aksoundengine.dll',
  'havok.dll',
  'mono-2.0-bdwgc.dll',
  'gameassembly.dll'
])

const STEAM_API_DLLS = ['steam_api.dll', 'steam_api64.dll']
const REDIST_FOLDERS = ['_commonredist', '_redist', 'redist', 'redistributables', 'directx', 'vcredist']

function hasRootFile(inspection: FolderInspection, name: string): boolean {
  const target = name.toLowerCase()
  return inspection.rootFiles.some((file) => file.toLowerCase() === target)
}

function hasRootDir(inspection: FolderInspection, predicate: (name: string) => boolean): boolean {
  return inspection.rootDirs.some((dir) => predicate(dir.toLowerCase()))
}

/** True for a folder that only holds a repack installer (setup.exe + .bin parts). */
export function looksLikeInstaller(inspection: FolderInspection): boolean {
  const files = inspection.rootFiles.map((file) => file.toLowerCase())
  const hasSetup = files.some((file) => /^(setup|install).*\.exe$/.test(file))
  if (!hasSetup) return false

  const fitgirlParts = inspection.binFiles.some((file) => /^fg-\d+\.bin$/.test(file) || /^setup-fitgirl.*\.bin$/.test(file))
  const fitgirlExtras =
    files.some((file) => /^verify bin files before installation\.bat$/.test(file)) ||
    inspection.folders.has('md5')
  const numberedParts = inspection.binFiles.some((file) => /(?:^|[-_.])\d{1,3}\.bin$/.test(file) || /^data\d*\.bin$/.test(file))

  // An installed game also has engine files next to it; an installer folder does not.
  const installedGameMarkers =
    hasRootFile(inspection, 'unityplayer.dll') ||
    hasRootDir(inspection, (dir) => dir === 'engine' || dir.endsWith('_data')) ||
    hasRootFile(inspection, 'unins000.exe')

  if (installedGameMarkers) return false
  if (fitgirlParts || fitgirlExtras || numberedParts) return true

  // Any other release folder: a setup program and nothing that can be launched.
  const hasSetupProgram = files.some((file) => /^(setup|install)[^\\/]*\.exe$/.test(file))
  return hasSetupProgram && inspection.executables.length === 0 && !hasRootFile(inspection, 'unityplayer.dll')
}

/** A folder that only carries a game update: "Foo update 1.2 - 1.3" or nothing but update executables. */
export function looksLikeUpdatePackage(inspection: FolderInspection): boolean {
  if (inspection.executables.length > 0) {
    // An installed game can ship an updater next to it. Only the folder name decides here.
    return looksLikeUpdateName(inspection.folderName) && inspection.dlls.size === 0 && inspection.archiveFiles === 0
  }
  return inspection.updateExecutables.length > 0
}

/**
 * One big executable and almost nothing else: a self-extracting installer or update,
 * not an installed game. Installed games always ship DLLs, data files or folders.
 */
export function looksLikeSelfExtractingPackage(inspection: FolderInspection): boolean {
  if (inspection.executables.length !== 1) return false
  const exe = inspection.executables[0]!
  if (exe.depth !== 0) return false
  const meaningfulDirs = inspection.rootDirs.filter((dir) => !/^(md5|_redist|_commonredist|redist|crack|fix)$/i.test(dir))
  return (
    inspection.dlls.size === 0 &&
    inspection.archiveFiles === 0 &&
    meaningfulDirs.length === 0 &&
    inspection.fileCount <= 4 &&
    exe.sizeBytes > 50 * 1024 * 1024
  )
}

export function detectEngine(inspection: FolderInspection): { engine: GameEngine; signals: Signal[] } {
  const signals: Signal[] = []

  // Engine markers must sit at the folder's own level, otherwise a folder that
  // merely contains a Unity or Unreal game would be mistaken for one.
  const unityPlayer = hasRootFile(inspection, 'unityplayer.dll')
  const unityData = hasRootDir(inspection, (dir) => dir.endsWith('_data'))
  if (unityPlayer && unityData) {
    signals.push({ id: 'engine:unity', points: 60 })
    return { engine: 'unity', signals }
  }

  const hasEngineDir = hasRootDir(inspection, (dir) => dir === 'engine')
  const projectBinaries = /^[^/]+\/binaries\/win(64|32|gdk)$/
  const hasBinaries = inspection.executables.some((exe) => projectBinaries.test(exe.relativeDir))
  const shippingExe = inspection.executables.some(
    (exe) => /-(win64|wingdk|win32)-shipping\.exe$/i.test(exe.fileName) && (exe.depth === 0 || projectBinaries.test(exe.relativeDir))
  )
  if ((hasEngineDir && hasBinaries) || shippingExe) {
    signals.push({ id: 'engine:unreal', points: 60 })
    return { engine: 'unreal', signals }
  }

  if (hasRootFile(inspection, 'data.win')) {
    signals.push({ id: 'engine:gamemaker', points: 50 })
    return { engine: 'gamemaker', signals }
  }

  const hasPck = inspection.rootFiles.some((file) => file.toLowerCase().endsWith('.pck'))
  const rootExe = inspection.executables.some((exe) => exe.depth === 0)
  if (hasPck && rootExe) {
    signals.push({ id: 'engine:godot', points: 50 })
    return { engine: 'godot', signals }
  }

  const rgss = inspection.rootFiles.some((file) => /\.(rgss3a|rgss2a|rgssad)$/i.test(file))
  const mvMz = hasRootDir(inspection, (dir) => dir === 'www') && (inspection.dlls.has('nw.dll') || hasRootFile(inspection, 'game.exe'))
  if (rgss || mvMz) {
    signals.push({ id: 'engine:rpgmaker', points: 50 })
    return { engine: 'rpgmaker', signals }
  }

  const renpy = hasRootDir(inspection, (dir) => dir === 'renpy') && hasRootDir(inspection, (dir) => dir === 'game')
  if (renpy) {
    signals.push({ id: 'engine:renpy', points: 50 })
  }

  return { engine: 'unknown', signals }
}

/** Pure scoring over an inspection. No file system access, so it is fully unit-testable. */
export function classifyFolder(inspection: FolderInspection, context: ClassificationContext): Classification {
  const threshold = THRESHOLDS[context.category]
  const hasExecutables = inspection.executables.length > 0

  if (looksLikeUpdatePackage(inspection)) {
    return { kind: 'update', score: 0, threshold, engine: 'unknown', signals: [{ id: 'update', points: 0 }], hasExecutables }
  }

  if (looksLikeInstaller(inspection) || looksLikeSelfExtractingPackage(inspection)) {
    return {
      kind: 'installer',
      score: 0,
      threshold,
      engine: 'unknown',
      signals: [{ id: 'installer', points: 0 }],
      hasExecutables
    }
  }

  const { engine, signals } = detectEngine(inspection)

  if (hasExecutables) signals.push({ id: 'has-executable', points: 15 })
  if (context.directChildOfRoot && context.category === 'games') signals.push({ id: 'games-root-child', points: 20 })

  if (STEAM_API_DLLS.some((dll) => inspection.dlls.has(dll))) signals.push({ id: 'steam-api', points: 35 })
  if (inspection.hasSteamEmulatorConfig) signals.push({ id: 'steam-emulator', points: 20 })

  const inno = hasRootFile(inspection, 'unins000.exe') && hasRootFile(inspection, 'unins000.dat')
  if (inno) signals.push({ id: 'inno-uninstaller', points: 10 })

  if (REDIST_FOLDERS.some((folder) => inspection.folders.has(folder))) signals.push({ id: 'redist-folder', points: 25 })

  let middleware = 0
  for (const dll of inspection.dlls) if (MIDDLEWARE_DLLS.has(dll)) middleware++
  if (middleware > 0) signals.push({ id: 'middleware', points: Math.min(30, middleware * 10) })

  if (inspection.archiveFiles >= 3) signals.push({ id: 'game-archives', points: 20 })
  else if (inspection.archiveFiles > 0) signals.push({ id: 'game-archives', points: 8 })

  if (context.externalBonus) signals.push({ id: 'external-source', points: context.externalBonus })

  const score = signals.reduce((total, signal) => total + signal.points, 0)
  const kind: FolderKind = hasExecutables && score >= threshold ? 'game' : 'none'

  return { kind, score, threshold, engine, signals, hasExecutables }
}

/** Points added once the folder size is known. Only used when a folder is close to the threshold. */
export function sizeBonus(sizeBytes: number): number {
  const gb = sizeBytes / 1024 ** 3
  if (gb >= 5) return 25
  if (gb >= 1) return 15
  if (gb >= 0.3) return 5
  return 0
}

/** Folder names that hold a game's own binaries, not other games. */
const BINARY_FOLDER_NAMES = new Set([
  'bin',
  'bin32',
  'bin64',
  'bin_x64',
  'bin_x86',
  'binaries',
  'x64',
  'x86',
  'win64',
  'win32',
  'game',
  'engine',
  'launcher',
  'release',
  'retail',
  'shipping',
  'client',
  'app',
  'data',
  'content',
  'system',
  'program'
])

export type FolderLayout = { type: 'single' } | { type: 'grouping' } | { type: 'nested'; child: string }

/**
 * Tells apart a real game folder from a container of games.
 *
 *   Games/Collection/{Game A, Game B}  -> grouping (look inside)
 *   Games/Foo/Foo/foo.exe              -> nested (the inner folder is the game)
 *   Games/Foo/foo.exe, Games/Foo/bin/  -> single
 */
export function analyzeLayout(inspection: FolderInspection, engine: GameEngine): FolderLayout {
  if (engine === 'unity' || engine === 'unreal' || engine === 'gamemaker' || engine === 'godot') return { type: 'single' }
  if (inspection.executables.some((exe) => exe.depth === 0)) return { type: 'single' }

  const segments = new Set<string>()
  for (const exe of inspection.executables) {
    const first = exe.relativeDir.split('/')[0]
    if (first && !BINARY_FOLDER_NAMES.has(first)) segments.add(first)
  }

  if (segments.size >= 2) return { type: 'grouping' }
  if (segments.size === 1) {
    const segment = [...segments][0]!
    const child = inspection.rootDirs.find((dir) => dir.toLowerCase() === segment) ?? segment
    return { type: 'nested', child }
  }
  return { type: 'single' }
}
