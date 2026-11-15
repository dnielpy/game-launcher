import { execFile } from 'node:child_process'
import path from 'node:path'
import type { RegistryEntry } from '../types'

const UNINSTALL_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
]

/** One registry key with its values, as printed by `reg query /s`. */
export interface RegistryKey {
  key: string
  values: Record<string, string>
}

const VALUE_LINE = /^\s{4}(.+?)\s{4}(REG_[A-Z_]+)(?:\s{4}(.*))?$/

/** Parses the text output of `reg query <key> /s`. */
export function parseRegQueryOutput(output: string): RegistryKey[] {
  const keys: RegistryKey[] = []
  let current: RegistryKey | null = null
  for (const rawLine of output.split(/\r?\n/)) {
    if (rawLine.trim().length === 0) continue
    if (/^HKEY_/.test(rawLine)) {
      current = { key: rawLine.trim(), values: {} }
      keys.push(current)
      continue
    }
    const match = VALUE_LINE.exec(rawLine)
    if (match && current) {
      const name = match[1]!.trim()
      current.values[name] = (match[3] ?? '').trim()
    }
  }
  return keys
}

function iconExePath(icon: string | undefined): string | null {
  if (!icon) return null
  const cleaned = icon.replace(/^"|"$/g, '').replace(/,\s*-?\d+$/, '').replace(/^"|"$/g, '').trim()
  return /\.exe$/i.test(cleaned) ? cleaned : null
}

/** Keeps uninstall entries that point to a real install folder and are not system components or updates. */
export function toRegistryEntries(keys: RegistryKey[]): RegistryEntry[] {
  const entries: RegistryEntry[] = []
  const seen = new Set<string>()
  for (const { values } of keys) {
    const displayName = values['DisplayName']
    if (!displayName) continue
    if (values['SystemComponent'] === '0x1') continue
    if (values['ParentKeyName'] || values['ReleaseType']) continue

    const icon = values['DisplayIcon'] ?? null
    const iconExe = iconExePath(icon ?? undefined)
    const location =
      values['InstallLocation'] || values['Inno Setup: App Path'] || (iconExe ? path.win32.dirname(iconExe) : '')
    if (!location) continue

    const installLocation = location.replace(/^"|"$/g, '').replace(/[\\/]+$/, '')
    if (/^[a-zA-Z]:$/.test(installLocation)) continue
    const dedupeKey = installLocation.toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    entries.push({
      displayName: displayName.trim(),
      installLocation,
      displayIcon: icon,
      publisher: values['Publisher'] ?? null
    })
  }
  return entries
}

export function runCommand(command: string, args: string[], timeoutMs = 20_000, verbatim = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
      windowsVerbatimArguments: verbatim
    }
    execFile(command, args, options, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}

/** Runs `reg query` with a UTF-8 code page so non-ASCII game names survive. */
export async function regQuery(key: string, extraArgs: string[] = []): Promise<string> {
  const quotedArgs = extraArgs.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg)).join(' ')
  // Verbatim arguments: cmd.exe does not understand Node's \" escaping. /s strips the outer quotes.
  return runCommand('cmd.exe', ['/d', '/s', '/c', `"chcp 65001 >nul && reg query "${key}" ${quotedArgs}"`], 20_000, true)
}

export async function readUninstallEntries(): Promise<RegistryEntry[]> {
  if (process.platform !== 'win32') return []
  const outputs = await Promise.all(UNINSTALL_KEYS.map((key) => regQuery(key, ['/s']).catch(() => '')))
  return toRegistryEntries(outputs.flatMap(parseRegQueryOutput))
}

export async function readRegistryValue(key: string, valueName: string): Promise<string | null> {
  if (process.platform !== 'win32') return null
  try {
    const output = await regQuery(key, ['/v', valueName])
    const parsed = parseRegQueryOutput(output)
    return parsed[0]?.values[valueName] ?? null
  } catch {
    return null
  }
}
