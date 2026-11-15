import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pickExecutable } from '../src/main/scanner/executablePicker'
import { inspectFolder } from '../src/main/scanner/folderInspector'
import { createTree, layouts, tempDir } from './fixtures'

const MB = 1024 * 1024
let root: { path: string; cleanup: () => void }

beforeAll(() => {
  root = tempDir()
  createTree(root.path, {
    'Hollow Knight': layouts.unity('hollow_knight'),
    'Stalker 2': layouts.unreal('Stalker2'),
    'Two Exes': { 'GameLauncher.exe': 30 * MB, 'TwoExes.exe': 90 * MB, 'Config.exe': 2 * MB },
    'Ambiguous': { 'alpha.exe': 50 * MB, 'beta.exe': 50 * MB },
    'Witcher 3': {
      bin: { x64: { 'witcher3.exe': 60 * MB }, x64_dx12: { 'witcher3.exe': 62 * MB } },
      'redkit': { 'redkit.exe': 30 * MB }
    }
  })
})

afterAll(() => root.cleanup())

async function pick(folder: string, title: string, options: { engine?: 'unreal' | 'unity' | 'unknown'; shortcut?: string } = {}) {
  const inspection = await inspectFolder(path.join(root.path, folder))
  return pickExecutable(inspection.executables, {
    title,
    folderName: folder,
    engine: options.engine ?? 'unknown',
    shortcutTargets: options.shortcut ? [path.join(root.path, folder, options.shortcut)] : []
  })
}

describe('pickExecutable', () => {
  it('ignores crash handlers in Unity games', async () => {
    const result = await pick('Hollow Knight', 'Hollow Knight', { engine: 'unity' })
    expect(path.basename(result.best!.path)).toBe('hollow_knight.exe')
  })

  it('prefers the Unreal bootstrap exe at the root', async () => {
    const result = await pick('Stalker 2', 'Stalker 2', { engine: 'unreal' })
    expect(path.basename(result.best!.path)).toBe('Stalker2.exe')
  })

  it('prefers the game over its launcher and config tool', async () => {
    const result = await pick('Two Exes', 'Two Exes')
    expect(path.basename(result.best!.path)).toBe('TwoExes.exe')
  })

  it('flags ties as ambiguous', async () => {
    const result = await pick('Ambiguous', 'Something Else')
    expect(result.ambiguous).toBe(true)
  })

  it('trusts a desktop shortcut over everything else', async () => {
    const result = await pick('Ambiguous', 'Something Else', { shortcut: 'beta.exe' })
    expect(path.basename(result.best!.path)).toBe('beta.exe')
    expect(result.anchored).toBe(true)
    expect(result.ambiguous).toBe(false)
  })

  it('finds executables in nested binary folders', async () => {
    const result = await pick('Witcher 3', 'The Witcher 3 Wild Hunt')
    expect(path.basename(result.best!.path)).toBe('witcher3.exe')
  })
})
