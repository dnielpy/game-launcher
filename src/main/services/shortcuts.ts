import { app, shell } from 'electron'
import path from 'node:path'
import type { Dirent } from 'node:fs'
import { readDirSafe } from '../scanner/fsUtils'
import type { ResolvedShortcut } from '../scanner/types'

function shortcutFolders(): string[] {
  const folders = [app.getPath('desktop'), path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')]
  const publicDir = process.env['PUBLIC']
  if (publicDir) folders.push(path.join(publicDir, 'Desktop'))
  const programData = process.env['PROGRAMDATA']
  if (programData) folders.push(path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'))
  return folders
}

async function collectLinkFiles(folder: string, depth: number, output: string[]): Promise<void> {
  let entries: Dirent[]
  try {
    entries = await readDirSafe(folder)
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(folder, entry.name)
    if (entry.isDirectory() && depth < 3) await collectLinkFiles(full, depth + 1, output)
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lnk')) output.push(full)
  }
}

/**
 * Resolves desktop and Start menu shortcuts. Runs in the main process because
 * shell.readShortcutLink is only available there.
 */
export async function readShortcuts(): Promise<ResolvedShortcut[]> {
  if (process.platform !== 'win32') return []
  const files: string[] = []
  for (const folder of shortcutFolders()) await collectLinkFiles(folder, 0, files)

  const shortcuts: ResolvedShortcut[] = []
  for (const file of files) {
    try {
      const details = shell.readShortcutLink(file)
      if (!details.target || !details.target.toLowerCase().endsWith('.exe')) continue
      shortcuts.push({
        shortcutPath: file,
        targetPath: details.target,
        args: details.args ?? '',
        workingDir: details.cwd ?? ''
      })
    } catch {
      continue
    }
  }
  return shortcuts
}
