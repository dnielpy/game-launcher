import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { analyzeLayout, classifyFolder } from '../src/main/scanner/folderClassifier'
import { inspectFolder } from '../src/main/scanner/folderInspector'
import { createTree, layouts, tempDir } from './fixtures'

const MB = 1024 * 1024
let root: { path: string; cleanup: () => void }

beforeAll(() => {
  root = tempDir()
  createTree(root.path, {
    'Hollow Knight': layouts.unity('hollow_knight'),
    'Stalker 2': layouts.unreal('Stalker2'),
    'Elden Ring [FitGirl Repack]': layouts.fitgirlInstaller(),
    'Celeste': layouts.indie('Celeste'),
    'Hades II': layouts.innoInstalled('Hades2'),
    'Notepad++': layouts.desktopApp('notepad++'),
    'Undertale': { 'UNDERTALE.exe': 6 * MB, 'data.win': 100 * MB },
    'Empty Folder': {},
    'Docs Only': { 'readme.txt': 'hello' },
    Collection: { 'Game A': layouts.indie('GameA'), 'Game B': layouts.indie('GameB') },
    'Doubled': { Doubled: layouts.indie('Doubled') }
  })
})

afterAll(() => root.cleanup())

async function classify(name: string, category: 'games' | 'noisy' = 'games') {
  const inspection = await inspectFolder(path.join(root.path, name))
  return { inspection, result: classifyFolder(inspection, { category, directChildOfRoot: true }) }
}

describe('classifyFolder', () => {
  it('detects Unity games', async () => {
    const { result } = await classify('Hollow Knight')
    expect(result.kind).toBe('game')
    expect(result.engine).toBe('unity')
  })

  it('detects Unreal games', async () => {
    const { result } = await classify('Stalker 2')
    expect(result.kind).toBe('game')
    expect(result.engine).toBe('unreal')
  })

  it('detects GameMaker games', async () => {
    const { result } = await classify('Undertale')
    expect(result.engine).toBe('gamemaker')
    expect(result.kind).toBe('game')
  })

  it('marks repack installers as installers, not games', async () => {
    const { result } = await classify('Elden Ring [FitGirl Repack]')
    expect(result.kind).toBe('installer')
  })

  it('accepts a plain game inside a games folder', async () => {
    const { result } = await classify('Celeste')
    expect(result.kind).toBe('game')
  })

  it('accepts an installed repack even in Program Files', async () => {
    const { result } = await classify('Hades II', 'noisy')
    expect(result.kind).toBe('game')
  })

  it('rejects regular desktop apps in Program Files', async () => {
    const { result } = await classify('Notepad++', 'noisy')
    expect(result.kind).toBe('none')
  })

  it('rejects folders without executables', async () => {
    expect((await classify('Empty Folder')).result.kind).toBe('none')
    expect((await classify('Docs Only')).result.kind).toBe('none')
  })

  it('never treats redistributable installers as game executables', async () => {
    const { inspection } = await classify('Hades II')
    const names = inspection.executables.map((exe) => exe.fileName.toLowerCase())
    expect(names).toEqual(['hades2.exe'])
  })
})

describe('analyzeLayout', () => {
  it('recognizes a folder holding several games', async () => {
    const { inspection, result } = await classify('Collection')
    expect(analyzeLayout(inspection, result.engine).type).toBe('grouping')
  })

  it('recognizes a doubled folder', async () => {
    const { inspection, result } = await classify('Doubled')
    expect(analyzeLayout(inspection, result.engine)).toEqual({ type: 'nested', child: 'Doubled' })
  })

  it('keeps Unreal games as a single game', async () => {
    const { inspection, result } = await classify('Stalker 2')
    expect(analyzeLayout(inspection, result.engine).type).toBe('single')
  })
})
