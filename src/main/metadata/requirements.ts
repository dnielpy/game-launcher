import type { GameRequirements, RequirementItem } from '@shared/types'
import { htmlToText } from './steamClient'

/** Headings stores put before the list, not requirements themselves. */
const HEADING = /^(minimum|recommended|minimum requirements|recommended requirements|requires a 64-bit processor and operating system)\s*:?\s*$/i

function toItems(lines: string[]): RequirementItem[] | null {
  const items: RequirementItem[] = []
  for (const raw of lines) {
    const line = raw.replace(/^[•*\-\s]+/, '').trim()
    if (!line || HEADING.test(line)) continue
    const match = /^([A-Za-z][A-Za-z /&.-]{1,30}?)\s*:\s*(.+)$/.exec(line)
    if (match) {
      const label = match[1]!.trim()
      if (/^(minimum|recommended)$/i.test(label)) {
        items.push(...(toItems([match[2]!]) ?? []))
        continue
      }
      items.push({ label, value: match[2]!.trim() })
    } else if (items.length > 0 && !/^requires a 64-bit/i.test(line)) {
      // A line without a label continues the previous one ("Additional Notes" often wraps).
      items[items.length - 1]!.value += ` ${line}`
    }
  }
  return items.length > 0 ? items : null
}

/** Steam's pc_requirements HTML: "<strong>Minimum:</strong><ul><li><strong>OS:</strong> Windows 10</li>...". */
export function parseSteamRequirementsHtml(html: unknown): RequirementItem[] | null {
  if (typeof html !== 'string' || !html.trim()) return null
  return toItems(htmlToText(html).split('\n'))
}

/** Steam's pc_requirements object, or an empty array when the game has none. */
export function parseSteamRequirements(value: unknown): GameRequirements | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const minimum = parseSteamRequirementsHtml(record['minimum'])
  const recommended = parseSteamRequirementsHtml(record['recommended'])
  return minimum || recommended ? { minimum, recommended } : null
}

/** RAWG puts plain text per platform: "Minimum:\nOS: Windows 10\nProcessor: ...". */
export function parseRawgRequirements(platforms: unknown): GameRequirements | null {
  if (!Array.isArray(platforms)) return null
  for (const entry of platforms) {
    const record = entry as Record<string, unknown> | null
    const slug = (record?.['platform'] as Record<string, unknown> | undefined)?.['slug']
    if (slug !== 'pc') continue
    const requirements = (record?.['requirements'] ?? record?.['requirements_en']) as Record<string, unknown> | undefined
    if (!requirements) return null
    const split = (value: unknown) => (typeof value === 'string' ? toItems(htmlToText(value).split('\n')) : null)
    const minimum = split(requirements['minimum'])
    const recommended = split(requirements['recommended'])
    return minimum || recommended ? { minimum, recommended } : null
  }
  return null
}
