import { safeStorage } from 'electron'
import type { Repository } from '../db/repository'

const RAWG_KEY_SETTING = 'rawgApiKey'

/** Stores the RAWG key encrypted with the operating system's credential store when it is available. */
export class SettingsService {
  constructor(private readonly repository: Repository) {}

  getRawgKey(): string | null {
    const stored = this.repository.getSetting(RAWG_KEY_SETTING)
    if (!stored) return null
    try {
      if (stored.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
      if (stored.startsWith('plain:')) return stored.slice(6)
    } catch {
      return null
    }
    return null
  }

  setRawgKey(key: string | null): void {
    const trimmed = key?.trim() ?? ''
    if (trimmed.length === 0) {
      this.repository.deleteSetting(RAWG_KEY_SETTING)
      return
    }
    const value = safeStorage.isEncryptionAvailable()
      ? `enc:${safeStorage.encryptString(trimmed).toString('base64')}`
      : `plain:${trimmed}`
    this.repository.setSetting(RAWG_KEY_SETTING, value)
  }
}
