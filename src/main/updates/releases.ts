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

/** What a partly downloaded installer was, saved next to it so a later run can resume it. */
export interface PartialDownload {
  version: string
  name: string
  size: number
  digest: string | null
}

export function partialFor(release: ReleaseInfo): PartialDownload | null {
  if (!release.asset) return null
  return { version: release.version, name: release.asset.name, size: release.asset.size, digest: release.asset.digest }
}

export function parsePartial(json: unknown): PartialDownload | null {
  const value = record(json)
  const version = text(value?.['version'])
  const name = text(value?.['name'])
  const size = value?.['size']
  if (!value || !version || !name || typeof size !== 'number') return null
  return { version, name, size, digest: text(value['digest']) }
}

/**
 * A partial download can only be continued when it is the very same installer as the
 * release on offer. When a newer version came out it no longer is, and it is thrown away.
 */
export function canResume(partial: PartialDownload | null, release: ReleaseInfo | null): boolean {
  const wanted = release ? partialFor(release) : null
  if (!partial || !wanted) return false
  return (
    compareVersions(partial.version, wanted.version) === 0 &&
    partial.name === wanted.name &&
    partial.size === wanted.size &&
    (partial.digest ?? null) === (wanted.digest ?? null)
  )
}

/** "bytes 100-199/200" -> { start: 100, total: 200 }. Null when the header is missing or malformed. */
export function parseContentRange(header: string | null): { start: number; total: number | null } | null {
  const match = header ? /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(header.trim()) : null
  if (!match) return null
  return { start: Number(match[1]), total: match[3] === '*' ? null : Number(match[3]) }
}
