import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { afterAll, beforeAll } from 'vitest'
import { epicEntryFromManifest, readEpicLibrary } from '../src/main/scanner/sources/epic'
import { parseRegQueryOutput, toRegistryEntries } from '../src/main/scanner/sources/registry'
import { libraryPathsFromVdf, parseAppManifest, readSteamLibrary } from '../src/main/scanner/sources/steam'
import { createTree, tempDir } from './fixtures'

const REG_OUTPUT = `
HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Hades II_is1
    Inno Setup: Setup Version    REG_SZ    6.2.2
    Inno Setup: App Path    REG_SZ    C:\\Games\\Hades II
    DisplayName    REG_SZ    Hades II
    DisplayIcon    REG_SZ    C:\\Games\\Hades II\\Ship\\Hades2.exe
    Publisher    REG_SZ    FitGirl
    EmptyValue    REG_SZ

HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\KB123456
    DisplayName    REG_SZ    Security Update
    ParentKeyName    REG_SZ    OperatingSystem

HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Driver
    DisplayName    REG_SZ    Some Driver
    SystemComponent    REG_DWORD    0x1
    InstallLocation    REG_SZ    C:\\Drivers

HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Celeste
    DisplayName    REG_SZ    Celeste
    DisplayIcon    REG_SZ    "D:\\Juegos\\Celeste\\Celeste.exe",0
`

describe('registry', () => {
  it('parses reg query output, including empty values', () => {
    const keys = parseRegQueryOutput(REG_OUTPUT)
    expect(keys).toHaveLength(4)
    expect(keys[0]!.values['Inno Setup: App Path']).toBe('C:\\Games\\Hades II')
    expect(keys[0]!.values['EmptyValue']).toBe('')
  })

  it('keeps real installs and skips updates and system components', () => {
    const entries = toRegistryEntries(parseRegQueryOutput(REG_OUTPUT))
    expect(entries.map((entry) => entry.displayName)).toEqual(['Hades II', 'Celeste'])
    expect(entries[1]!.installLocation).toBe('D:\\Juegos\\Celeste')
  })
})

describe('steam', () => {
  it('reads library folders', () => {
    const vdf = `"libraryfolders"
{
  "0" { "path" "C:\\\\Program Files (x86)\\\\Steam" "apps" { "620" "123" } }
  "1" { "path" "D:\\\\SteamLibrary" }
}`
    expect(libraryPathsFromVdf(vdf)).toEqual(['C:\\Program Files (x86)\\Steam', 'D:\\SteamLibrary'])
  })

  it('parses app manifests', () => {
    const manifest = parseAppManifest(`"AppState" { "appid" "620" "name" "Portal 2" "installdir" "Portal 2" "StateFlags" "4" }`)
    expect(manifest).toEqual({ appId: '620', name: 'Portal 2', installDir: 'Portal 2', fullyInstalled: true })
  })

  describe('library on disk', () => {
    let dir: { path: string; cleanup: () => void }
    beforeAll(() => {
      dir = tempDir()
      createTree(dir.path, {
        steamapps: {
          'libraryfolders.vdf': '"libraryfolders" { }',
          'appmanifest_620.acf': '"AppState" { "appid" "620" "name" "Portal 2" "installdir" "Portal 2" "StateFlags" "4" }',
          'appmanifest_228980.acf': '"AppState" { "appid" "228980" "name" "Steamworks Common Redistributables" "installdir" "Steamworks Shared" "StateFlags" "4" }',
          'appmanifest_400.acf': '"AppState" { "appid" "400" "name" "Portal" "installdir" "Portal" "StateFlags" "1026" }',
          common: { 'Portal 2': { 'portal2.exe': 100 } }
        }
      })
    })
    afterAll(() => dir.cleanup())

    it('lists installed games and skips tools and partial downloads', async () => {
      const entries = await readSteamLibrary(dir.path)
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({
        title: 'Portal 2',
        installPath: path.join(dir.path, 'steamapps', 'common', 'Portal 2'),
        launch: { type: 'uri', uri: 'steam://rungameid/620' }
      })
    })
  })
})

describe('epic', () => {
  it('builds a launch uri from a manifest', () => {
    const entry = epicEntryFromManifest({
      DisplayName: 'Alan Wake 2',
      InstallLocation: 'D:\\Epic Games\\AlanWake2',
      AppName: 'Dodo',
      CatalogNamespace: 'ns',
      CatalogItemId: 'item',
      AppCategories: ['public', 'games', 'applications']
    })
    expect(entry?.launch).toEqual({ type: 'uri', uri: 'com.epicgames.launcher://apps/ns%3Aitem%3ADodo?action=launch&silent=true' })
  })

  it('skips incomplete installs and non-games', () => {
    expect(epicEntryFromManifest({ DisplayName: 'X', InstallLocation: 'C:\\X', AppName: 'x', bIsIncompleteInstall: true })).toBeNull()
    expect(epicEntryFromManifest({ DisplayName: 'Unreal Engine', InstallLocation: 'C:\\UE', AppName: 'UE', AppCategories: ['engines'] })).toBeNull()
  })

  it('returns nothing when the launcher is not installed', async () => {
    expect(await readEpicLibrary('/definitely/not/here')).toEqual([])
  })
})
