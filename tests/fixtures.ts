import { mkdtempSync, mkdirSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Folder tree spec. A string value is file content, a number is a file size in
 * bytes (created sparse, so big sizes cost nothing), an object is a folder.
 */
export type TreeSpec = { [name: string]: string | number | TreeSpec }

export function createTree(base: string, spec: TreeSpec): void {
  mkdirSync(base, { recursive: true })
  for (const [name, value] of Object.entries(spec)) {
    const target = path.join(base, name)
    if (typeof value === 'object') {
      createTree(target, value)
    } else if (typeof value === 'number') {
      writeFileSync(target, '')
      truncateSync(target, value)
    } else {
      writeFileSync(target, value)
    }
  }
}

/**
 * Fixtures live inside the project, not in the OS temp folder: "Temp" is an
 * excluded folder name for the scanner, so fixtures under it would be skipped.
 */
export function tempDir(prefix = 'fixture-'): { path: string; cleanup: () => void } {
  const base = path.join(process.cwd(), '.test-fixtures')
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(path.join(base, prefix))
  return { path: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

const MB = 1024 * 1024
const GB = 1024 * MB

/** Realistic layouts used by several test files. */
export const layouts = {
  unity: (name: string): TreeSpec => ({
    [`${name}.exe`]: 650 * 1024,
    'UnityPlayer.dll': 28 * MB,
    'UnityCrashHandler64.exe': 1 * MB,
    [`${name}_Data`]: { 'data.unity3d': 2 * GB, Plugins: { 'steam_api64.dll': 300 * 1024 } }
  }),
  unreal: (project: string, exeName = project): TreeSpec => ({
    [`${exeName}.exe`]: 300 * 1024,
    Engine: {
      Binaries: { Win64: { 'CrashReportClient.exe': 20 * MB }, ThirdParty: { PhysX3: { 'PhysX3_x64.dll': 2 * MB } } }
    },
    [project]: {
      Binaries: { Win64: { [`${project}-Win64-Shipping.exe`]: 120 * MB, 'steam_api64.dll': 300 * 1024 } },
      Content: { Paks: { [`${project}-WindowsNoEditor.pak`]: 30 * GB } }
    }
  }),
  indie: (exeName: string): TreeSpec => ({
    [`${exeName}.exe`]: 40 * MB,
    data: { 'level1.dat': 10 * MB }
  }),
  fitgirlInstaller: (): TreeSpec => ({
    'setup.exe': 6 * MB,
    'fg-01.bin': 4 * GB,
    'fg-02.bin': 4 * GB,
    'fg-optional-bonus.bin': 100 * MB,
    MD5: { 'fitgirl-bins.md5': 'abc', 'QuickSFV.EXE': 100 * 1024 },
    'Verify BIN files before installation.bat': '@echo off'
  }),
  innoInstalled: (exeName: string): TreeSpec => ({
    [`${exeName}.exe`]: 80 * MB,
    'unins000.exe': 3 * MB,
    'unins000.dat': 50 * 1024,
    'steam_api64.dll': 300 * 1024,
    _CommonRedist: { DirectX: { 'DXSETUP.exe': 500 * 1024 }, vcredist: { 'vc_redist.x64.exe': 24 * MB } }
  }),
  desktopApp: (exeName: string): TreeSpec => ({
    [`${exeName}.exe`]: 5 * MB,
    'unins000.exe': 3 * MB,
    'unins000.dat': 50 * 1024,
    'libcrypto.dll': 3 * MB,
    plugins: { 'plugin.dll': 1 * MB }
  })
}
