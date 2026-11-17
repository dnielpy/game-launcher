import { safeStorage } from 'electron'
import type { ScanMode, SkinId } from '@shared/types'
import type { Repository } from '../db/repository'

const RAWG_KEY_SETTING = 'rawgApiKey'
const STEAMGRIDDB_KEY_SETTING = 'steamGridDbApiKey'
const SKIN_SETTING = 'skin'
const SCAN_MODE_SETTING = 'scanMode'
const SKINS: SkinId[] = ['orus', 'cinema', 'mosaic']

/** Stores API keys encrypted with the operating system's credential store when it is available. */
export class SettingsService {
  constructor(private readonly repository: Repository) {}

  getRawgKey(): string | null {
    return this.getSecret(RAWG_KEY_SETTING)
  }

  setRawgKey(key: string | null): void {
    this.setSecret(RAWG_KEY_SETTING, key)
  }

  getSteamGridDbKey(): string | null {
    return this.getSecret(STEAMGRIDDB_KEY_SETTING)
  }

  setSteamGridDbKey(key: string | null): void {
    this.setSecret(STEAMGRIDDB_KEY_SETTING, key)
  }

  getSkin(): SkinId {
    const value = this.repository.getSetting(SKIN_SETTING)
    return SKINS.includes(value as SkinId) ? (value as SkinId) : 'orus'
  }

  setSkin(skin: SkinId): void {
    this.repository.setSetting(SKIN_SETTING, skin)
  }

  getScanMode(): ScanMode {
    return this.repository.getSetting(SCAN_MODE_SETTING) === 'manual' ? 'manual' : 'auto'
  }

  setScanMode(mode: ScanMode): void {
    this.repository.setSetting(SCAN_MODE_SETTING, mode)
  }

  private getSecret(setting: string): string | null {
    const stored = this.repository.getSetting(setting)
    if (!stored) return null
    try {
      if (stored.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
      if (stored.startsWith('plain:')) return stored.slice(6)
    } catch {
      return null
    }
    return null
  }

  private setSecret(setting: string, key: string | null): void {
    const trimmed = key?.trim() ?? ''
    if (trimmed.length === 0) {
      this.repository.deleteSetting(setting)
      return
    }
    const value = safeStorage.isEncryptionAvailable() ? `enc:${safeStorage.encryptString(trimmed).toString('base64')}` : `plain:${trimmed}`
    this.repository.setSetting(setting, value)
  }
}
