import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isSafeEntryName, openContainer, writeContainer } from '../src/main/backup/container'
import { tempDir } from './fixtures'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

function workspace() {
  const dir = tempDir('container-')
  cleanups.push(dir.cleanup)
  return dir.path
}

describe('backup container', () => {
  it('stores a manifest and files and reads them back', async () => {
    const dir = workspace()
    await fs.writeFile(path.join(dir, 'a.jpg'), Buffer.from([1, 2, 3, 4]))
    await fs.writeFile(path.join(dir, 'b.png'), Buffer.from('hello'))
    const target = path.join(dir, 'out.orus')

    const written = await writeContainer(target, { hello: 'world' }, [
      { name: 'games/1/cover.jpg', path: path.join(dir, 'a.jpg') },
      { name: 'icons/1.png', path: path.join(dir, 'b.png') }
    ])
    expect(written.entries.map((entry) => entry.name)).toEqual(['games/1/cover.jpg', 'icons/1.png'])

    const container = await openContainer(target)
    expect(container.manifest['hello']).toBe('world')
    expect([...(await container.read('games/1/cover.jpg'))!]).toEqual([1, 2, 3, 4])
    expect((await container.read('icons/1.png'))!.toString()).toBe('hello')
    expect(await container.read('missing')).toBeNull()
    await container.close()
  })

  it('skips files that no longer exist and leaves no partial file behind', async () => {
    const dir = workspace()
    const target = path.join(dir, 'out.orus')
    const written = await writeContainer(target, {}, [{ name: 'icons/9.png', path: path.join(dir, 'gone.png') }])
    expect(written.entries).toEqual([])
    expect((await fs.readdir(dir)).sort()).toEqual(['out.orus'])
  })

  it('rejects files that are not Orus data and truncated files', async () => {
    const dir = workspace()
    const bogus = path.join(dir, 'bogus.orus')
    await fs.writeFile(bogus, 'this is not a backup at all')
    await expect(openContainer(bogus)).rejects.toThrow('not an Orus data file')

    await fs.writeFile(path.join(dir, 'a.bin'), Buffer.alloc(100, 7))
    const target = path.join(dir, 'ok.orus')
    await writeContainer(target, {}, [{ name: 'games/1/a.bin', path: path.join(dir, 'a.bin') }])
    const bytes = await fs.readFile(target)
    const cut = path.join(dir, 'cut.orus')
    await fs.writeFile(cut, bytes.subarray(0, bytes.length - 50))
    await expect(openContainer(cut)).rejects.toThrow('incomplete')
  })

  it('never exposes unsafe entry names', async () => {
    expect(isSafeEntryName('games/12/cover.jpg')).toBe(true)
    expect(isSafeEntryName('../evil.exe')).toBe(false)
    expect(isSafeEntryName('games/../../evil')).toBe(false)
    expect(isSafeEntryName('/etc/passwd')).toBe(false)
    expect(isSafeEntryName('games\\1\\a.jpg')).toBe(false)

    const dir = workspace()
    await fs.writeFile(path.join(dir, 'x.bin'), 'x')
    const target = path.join(dir, 'unsafe.orus')
    await writeContainer(target, {}, [{ name: '../escape.txt', path: path.join(dir, 'x.bin') }])
    const container = await openContainer(target)
    expect(await container.read('../escape.txt')).toBeNull()
    await container.close()
  })
})
