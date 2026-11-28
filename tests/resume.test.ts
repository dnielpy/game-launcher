import { describe, expect, it } from 'vitest'
import { canResume, parseContentRange, parsePartial, partialFor, type ReleaseInfo } from '../src/main/updates/releases'

function release(version: string, digest: string | null = 'sha256:abc'): ReleaseInfo {
  return {
    version,
    tag: `v${version}`,
    notes: null,
    publishedAt: null,
    pageUrl: null,
    asset: { name: `Orus-Setup-${version}.exe`, url: `https://example.test/${version}.exe`, size: 1000, digest }
  }
}

describe('canResume', () => {
  it('continues the same installer', () => {
    expect(canResume(partialFor(release('1.4.2')), release('1.4.2'))).toBe(true)
  })

  it('throws away a partial when a newer version came out', () => {
    expect(canResume(partialFor(release('1.4.2')), release('1.4.3'))).toBe(false)
  })

  it('throws away a partial when the installer was replaced', () => {
    expect(canResume(partialFor(release('1.4.2')), release('1.4.2', 'sha256:other'))).toBe(false)
    expect(canResume(null, release('1.4.2'))).toBe(false)
    expect(canResume(partialFor(release('1.4.2')), null)).toBe(false)
  })

  it('reads the saved description back', () => {
    const saved = JSON.parse(JSON.stringify(partialFor(release('1.4.2'))))
    expect(canResume(parsePartial(saved), release('1.4.2'))).toBe(true)
    expect(parsePartial({ version: '1.4.2' })).toBeNull()
    expect(parsePartial('nope')).toBeNull()
  })
})

describe('parseContentRange', () => {
  it('reads where the server resumed', () => {
    expect(parseContentRange('bytes 500-999/1000')).toEqual({ start: 500, total: 1000 })
    expect(parseContentRange('bytes 0-9/*')).toEqual({ start: 0, total: null })
    expect(parseContentRange(null)).toBeNull()
    expect(parseContentRange('items 1-2/3')).toBeNull()
  })
})
