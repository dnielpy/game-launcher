import { describe, expect, it } from 'vitest'
import { compareVersions, parseRelease, pickInstallerAsset, SpeedMeter } from '../src/main/updates/releases'

describe('compareVersions', () => {
  it('orders versions', () => {
    expect(compareVersions('v0.3.0', '0.2.0')).toBeGreaterThan(0)
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', '1.0.0-beta.2')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-beta.10', '1.0.0-beta.2')).toBeGreaterThan(0)
    expect(compareVersions('0.2.0', 'v0.3.0')).toBeLessThan(0)
  })
})

describe('parseRelease', () => {
  it('reads the latest release and its installer', () => {
    const release = parseRelease({
      tag_name: 'v0.3.0',
      body: 'Emulators section',
      published_at: '2026-11-16T10:00:00Z',
      html_url: 'https://github.com/x/y/releases/tag/v0.3.0',
      assets: [
        { name: 'latest.yml', browser_download_url: 'https://x/latest.yml', size: 300 },
        { name: 'Orus-Setup-0.3.0.exe', browser_download_url: 'https://x/Orus-Setup-0.3.0.exe', size: 90_000_000, digest: 'sha256:abc' }
      ]
    })
    expect(release).toMatchObject({
      version: '0.3.0',
      notes: 'Emulators section',
      asset: { name: 'Orus-Setup-0.3.0.exe', size: 90_000_000, digest: 'sha256:abc' }
    })
  })

  it('ignores drafts and odd tags', () => {
    expect(parseRelease({ tag_name: 'v1.0.0', draft: true })).toBeNull()
    expect(parseRelease({ tag_name: 'nightly' })).toBeNull()
    expect(pickInstallerAsset([{ name: 'notes.txt', browser_download_url: 'x' }])).toBeNull()
  })
})

describe('SpeedMeter', () => {
  it('measures the recent download speed', () => {
    const meter = new SpeedMeter(3000)
    meter.add(0, 0)
    meter.add(1_000_000, 1000)
    meter.add(2_000_000, 2000)
    expect(meter.bytesPerSecond()).toBe(1_000_000)
    // Old samples fall out of the window: the speed follows the latest second.
    meter.add(2_500_000, 5000)
    meter.add(5_500_000, 6000)
    expect(meter.bytesPerSecond()).toBeCloseTo(3_000_000, -3)
  })
})
