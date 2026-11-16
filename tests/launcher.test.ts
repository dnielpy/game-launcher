import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ shell: {} }))
vi.mock('../src/main/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { batchCommand, launchKind, splitArgs } = await import('../src/main/services/launcher')

describe('launchKind', () => {
  it('tells executables, scripts and other files apart', () => {
    expect(launchKind('D:\\Games\\Foo\\foo.EXE')).toBe('exe')
    expect(launchKind('D:\\Games\\Foo\\Start Game.bat')).toBe('script')
    expect(launchKind('D:\\Games\\Foo\\run.cmd')).toBe('script')
    expect(launchKind('C:\\Users\\me\\Desktop\\Foo.lnk')).toBe('other')
  })
})

describe('batchCommand', () => {
  it('quotes the script path and keeps the arguments', () => {
    expect(batchCommand('D:\\My Games\\Foo\\start.bat', '')).toBe('"D:\\My Games\\Foo\\start.bat"')
    expect(batchCommand('D:\\My Games\\Foo\\start.bat', ' -windowed ')).toBe('"D:\\My Games\\Foo\\start.bat" -windowed')
  })
})

describe('splitArgs', () => {
  it('keeps quoted arguments together', () => {
    expect(splitArgs('-a "two words" -b')).toEqual(['-a', 'two words', '-b'])
  })
})
