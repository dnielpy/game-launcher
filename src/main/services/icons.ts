import { app } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export function iconsDirectory(): string {
  return path.join(app.getPath('userData'), 'icons')
}

export function gameMediaDirectory(): string {
  return path.join(app.getPath('userData'), 'media', 'games')
}

/** Extracts the exe icon to a PNG file. Returns the file name, or null when Windows has no icon for it. */
export async function extractIcon(gameId: number, exePath: string): Promise<string | null> {
  try {
    const image = await app.getFileIcon(exePath, { size: 'large' })
    if (image.isEmpty()) return null
    const directory = iconsDirectory()
    mkdirSync(directory, { recursive: true })
    const fileName = `${gameId}.png`
    writeFileSync(path.join(directory, fileName), image.toPNG())
    return fileName
  } catch {
    return null
  }
}
