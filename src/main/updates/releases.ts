/** Pure helpers for reading GitHub releases. No Electron imports, so they are unit-tested. */

export interface ReleaseAsset {
  name: string
  url: string
  size: number
  /** "sha256:<hex>" when GitHub provides it. */
  digest: string | null
}

export interface ReleaseInfo {
  version: string
  tag: string
  notes: string | null
  publishedAt: string | null
  pageUrl: string | null
  asset: ReleaseAsset | null
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** "v1.2.3" or "1.2.3-beta.1" -> [1, 2, 3] plus the pre-release label. */
export function parseVersion(value: string): { parts: number[]; pre: string | null } | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(value.trim())
  if (!match) return null
  return { parts: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ?? null }
}

/** Positive when a is newer than b. A release is newer than a pre-release of the same version. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) return 0
  for (let i = 0; i < 3; i++) {
    const diff = left.parts[i]! - right.parts[i]!
    if (diff !== 0) return diff
  }
  if (left.pre === right.pre) return 0
  if (left.pre === null) return 1
  if (right.pre === null) return -1
  return left.pre.localeCompare(right.pre, undefined, { numeric: true })
}

/** The Windows installer of a release: an .exe asset, preferring the one named like an installer. */
export function pickInstallerAsset(assets: unknown): ReleaseAsset | null {
  if (!Array.isArray(assets)) return null
  const exes = assets
    .map((raw) => {
      const asset = record(raw)
      const name = text(asset?.['name'])
      const url = text(asset?.['browser_download_url'])
      const size = asset?.['size']
      if (!asset || !name || !url || !/\.exe$/i.test(name)) return null
      return { name, url, size: typeof size === 'number' ? size : 0, digest: text(asset['digest']) }
    })
    .filter((asset): asset is ReleaseAsset => asset !== null)
  return exes.find((asset) => /setup/i.test(asset.name)) ?? exes[0] ?? null
}

export function parseRelease(json: unknown): ReleaseInfo | null {
  const release = record(json)
  const tag = text(release?.['tag_name'])
  if (!release || !tag || release['draft'] === true) return null
  const parsed = parseVersion(tag)
  if (!parsed) return null
  return {
    version: `${parsed.parts.join('.')}${parsed.pre ? `-${parsed.pre}` : ''}`,
    tag,
    notes: text(release['body']),
    publishedAt: text(release['published_at']),
    pageUrl: text(release['html_url']),
    asset: pickInstallerAsset(release['assets'])
  }
}

/**
 * Download speed over the last few seconds. Each sample is the total bytes received
 * at a moment; the speed is the slope between the oldest and newest sample in the window.
 */
export class SpeedMeter {
  private readonly samples: { time: number; bytes: number }[] = []

  constructor(private readonly windowMs = 3000) {}

  add(bytes: number, time = Date.now()): void {
    this.samples.push({ time, bytes })
    while (this.samples.length > 2 && time - this.samples[0]!.time > this.windowMs) this.samples.shift()
  }

  bytesPerSecond(): number {
    if (this.samples.length < 2) return 0
    const first = this.samples[0]!
    const last = this.samples[this.samples.length - 1]!
    const seconds = (last.time - first.time) / 1000
    return seconds > 0 ? Math.max(0, (last.bytes - first.bytes) / seconds) : 0
  }
}
