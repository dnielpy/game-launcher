import Database from 'better-sqlite3'
import { sqliteAvailable } from './sqlite'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrate } from '../src/main/db/database'
import { Repository } from '../src/main/db/repository'
import { MetadataService } from '../src/main/metadata/metadataService'
import type { ScanCandidate } from '../src/main/scanner/types'

const IMAGE = new Uint8Array(4096).fill(7)
const directories: string[] = []
afterEach(() => directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))

function candidate(title: string, installPath: string): ScanCandidate {
  return {
    installPath,
    folderName: title,
    title,
    searchTitle: title,
    sources: ['folder'],
    category: 'game',
    engine: 'unknown',
    confidence: 80,
    needsReview: false,
    launch: null,
    exeCandidates: [],
    sizeBytes: 1
  }
}

/** A fake Steam store with two games and one DLC. */
function fakeSteam(requests: string[]) {
  return async (url: string): Promise<Response> => {
    requests.push(url)
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.includes('/api/storesearch/')) {
      const term = decodeURIComponent(/term=([^&]+)/.exec(url)![1]!)
      if (/cyberpunk/i.test(term)) {
        return json({ items: [{ type: 'app', id: 2138330, name: 'Cyberpunk 2077: Phantom Liberty' }, { type: 'app', id: 1091500, name: 'Cyberpunk 2077' }] })
      }
      return json({ items: [] })
    }
    if (url.includes('/api/appdetails')) {
      const id = /appids=(\d+)/.exec(url)![1]!
      const type = id === '2138330' ? 'dlc' : 'game'
      return json({ [id]: { success: true, data: { type, name: id === '1091500' ? 'Cyberpunk 2077' : 'Phantom Liberty', header_image: 'https://cdn/header.jpg', screenshots: [{ path_full: 'https://cdn/s1.jpg' }] } } })
    }
    if (url.includes('/appreviews/')) return json({ query_summary: { total_positive: 80, total_reviews: 100, review_score_desc: 'Very Positive' } })
    if (url.includes('GetItems')) return json({ response: { store_items: [{}] } })
    if (url.includes('library_600x900_2x.jpg')) return new Response(IMAGE, { status: 200, headers: { 'content-type': 'image/jpeg' } })
    if (url.includes('cdn/')) return new Response(IMAGE, { status: 200, headers: { 'content-type': 'image/jpeg' } })
    return new Response('missing', { status: 404 })
  }
}

describe.skipIf(!sqliteAvailable)('MetadataService', () => {
  it('matches games on Steam, skips DLCs and caches the artwork', async () => {
    const db = new Database(':memory:')
    migrate(db)
    const repository = new Repository(db)
    const cyberpunk = repository.insertGame(candidate('Cyberpunk 2077', 'D:\\Juegos\\Cyberpunk'))
    const unknown = repository.insertGame(candidate('Some Obscure Thing', 'D:\\Juegos\\Obscure'))
    const mediaDirectory = mkdtempSync(path.join(os.tmpdir(), 'media-'))
    directories.push(mediaDirectory)
    const requests: string[] = []

    const service = new MetadataService({
      repository,
      mediaDirectory,
      fetch: fakeSteam(requests),
      getRawgKey: () => null,
      getSteamGridDbKey: () => null,
      onProgress: () => {},
      onGameChanged: () => {}
    })
    await service.runPending()

    const game = repository.getGame(cyberpunk)!
    expect(game.metadataStatus).toBe('matched')
    expect(game.metadata).toMatchObject({ externalId: '1091500', rating: 80, ratingLabel: 'Very Positive', coverFile: 'cover.jpg', heroFile: 'hero.jpg' })
    expect(game.metadata!.screenshotFiles).toEqual(['shot-1.jpg'])
    expect(existsSync(path.join(mediaDirectory, String(cyberpunk), 'cover.jpg'))).toBe(true)
    expect(requests.some((url) => url.includes('appids=2138330'))).toBe(false)

    expect(repository.getGame(unknown)!.metadataStatus).toBe('not_found')
  })
})
