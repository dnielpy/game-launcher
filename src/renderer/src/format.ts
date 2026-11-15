export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—'
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

/** Stable hue for a title, so each game keeps its own tile color. */
export function titleHue(title: string): number {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

export function iconUrl(iconPath: string | null): string | null {
  return iconPath ? `media://icons/${encodeURIComponent(iconPath)}` : null
}

export function fileName(fullPath: string): string {
  return fullPath.split(/[\\/]/).pop() ?? fullPath
}
