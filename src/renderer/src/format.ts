import type { Game } from '@shared/types'

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return 'Unknown'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "12 h 40 min", "35 min", "Not played yet". */
export function formatPlaytime(seconds: number): string {
  if (seconds < 60) return seconds > 0 ? 'Less than a minute' : 'Not played yet'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours === 0) return `${minutes} min`
  if (hours >= 100) return `${hours} h`
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`
}

/** Short version for tiles: "12.5 h". */
export function formatHoursShort(seconds: number): string {
  const hours = seconds / 3600
  if (hours < 1) return `${Math.max(1, Math.round(seconds / 60))} min`
  return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)} h`
}

export function formatRelative(iso: string | null): string {
  if (!iso) return 'Never'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return formatDate(iso)
}

/** Stable hue for a title, so each game keeps its own placeholder color. */
export function titleHue(title: string): number {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

export function iconUrl(iconPath: string | null): string | null {
  return iconPath ? `media://icons/${encodeURIComponent(iconPath)}` : null
}

export function mediaUrl(game: Game, file: string | null | undefined): string | null {
  return file ? `media://games/${game.id}/${encodeURIComponent(file)}` : null
}

export function coverUrl(game: Game): string | null {
  return mediaUrl(game, game.metadata?.coverFile)
}

export function heroUrl(game: Game): string | null {
  return mediaUrl(game, game.metadata?.heroFile ?? game.metadata?.coverFile)
}

export function logoUrl(game: Game): string | null {
  return mediaUrl(game, game.metadata?.logoFile)
}

export function releaseYear(game: Game): string | null {
  const match = /\b(19|20)\d{2}\b/.exec(game.metadata?.releaseDate ?? '')
  return match ? match[0] : null
}

export function fileName(fullPath: string): string {
  return fullPath.split(/[\\/]/).pop() ?? fullPath
}

/** Long Windows paths shortened in the middle, keeping the drive and the last folders. */
export function shortenPath(fullPath: string, max = 70): string {
  if (fullPath.length <= max) return fullPath
  const parts = fullPath.split(/[\\/]/)
  const head = parts[0] ?? ''
  let tail = parts[parts.length - 1] ?? ''
  for (let i = parts.length - 2; i > 0; i--) {
    const next = `${parts[i]}\\${tail}`
    if (head.length + next.length + 5 > max) break
    tail = next
  }
  return `${head}\\…\\${tail}`
}
