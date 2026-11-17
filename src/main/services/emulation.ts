import path from 'node:path'
import type { EmulatedPlatform, EmulationPlatformState, Game } from '@shared/types'
import type { Repository } from '../db/repository'

export const EMULATED_PLATFORMS: EmulatedPlatform[] = ['switch']

/** Emulators that run Switch games, by executable or name. */
const SWITCH_EMULATOR = /\b(yuzu|suyu|sudachi|citron|eden|torzu|ryujinx)\b/i

function enabledKey(platform: EmulatedPlatform): string {
  return `emulation.${platform}.enabled`
}

function emulatorKey(platform: EmulatedPlatform): string {
  return `emulation.${platform}.emulator`
}

function exeOf(game: Game): string | null {
  return game.launch?.type === 'exe' ? game.launch.exePath : null
}

export function runsPlatform(emulator: Game, platform: EmulatedPlatform): boolean {
  if (platform !== 'switch') return false
  const exe = exeOf(emulator)
  return SWITCH_EMULATOR.test(emulator.title) || (exe !== null && SWITCH_EMULATOR.test(path.win32.basename(exe)))
}

/**
 * Command-line arguments that open a game directly, in full screen where the emulator supports it.
 * yuzu and its forks take "-f -g <file>"; Ryujinx takes the file alone.
 */
export function romLaunchArgs(emulatorExe: string, romPath: string): string[] {
  const name = path.win32.basename(emulatorExe).toLowerCase()
  if (/ryujinx/.test(name)) return [romPath]
  if (/(yuzu|suyu|sudachi|citron|eden|torzu)/.test(name)) return ['-f', '-g', romPath]
  return [romPath]
}

/** Which consoles are turned on and which emulator starts their games. Kept in the settings table. */
export class EmulationService {
  constructor(private readonly repository: Repository) {}

  isEnabled(platform: EmulatedPlatform): boolean {
    return this.repository.getSetting(enabledKey(platform)) === '1'
  }

  enabledPlatforms(): EmulatedPlatform[] {
    return EMULATED_PLATFORMS.filter((platform) => this.isEnabled(platform))
  }

  setEnabled(platform: EmulatedPlatform, enabled: boolean): void {
    this.repository.setSetting(enabledKey(platform), enabled ? '1' : '0')
  }

  setEmulator(platform: EmulatedPlatform, emulatorId: number | null): void {
    if (emulatorId === null) this.repository.deleteSetting(emulatorKey(platform))
    else this.repository.setSetting(emulatorKey(platform), String(emulatorId))
  }

  chosenEmulatorId(platform: EmulatedPlatform): number | null {
    const value = Number(this.repository.getSetting(emulatorKey(platform)))
    return Number.isInteger(value) && value > 0 ? value : null
  }

  /** The emulator the user picked if it is still there, otherwise the first installed one that runs this console. */
  resolveEmulator(platform: EmulatedPlatform, games: Game[] = this.repository.listGames()): Game | null {
    const emulators = games.filter((game) => game.category === 'emulator' && game.status === 'installed' && exeOf(game) !== null)
    const chosen = this.chosenEmulatorId(platform)
    const picked = chosen !== null ? emulators.find((game) => game.id === chosen) : undefined
    return picked ?? emulators.find((game) => runsPlatform(game, platform)) ?? null
  }

  state(platform: EmulatedPlatform): EmulationPlatformState {
    const games = this.repository.listGames()
    return {
      platform,
      enabled: this.isEnabled(platform),
      emulatorId: this.chosenEmulatorId(platform),
      resolvedEmulatorId: this.resolveEmulator(platform, games)?.id ?? null,
      gameCount: games.filter((game) => game.platform === platform).length
    }
  }
}
