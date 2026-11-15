import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Game, GameMetadata, MetadataCandidate, MetadataProgress, MetadataSource } from '@shared/types'
import type { Repository } from '../db/repository'
import { log } from '../logger'
import { ACCEPT_SCORE, matchScore, searchQueries } from './matcher'
import { RawgClient, type RawgSearchItem } from './rawgClient'
import { RateLimitError, SteamClient, type FetchLike, type SteamSearchItem } from './steamClient'

const MAX_SCREENSHOTS = 4
const STEAM_REQUEST_GAP_MS = 300
const RATE_LIMIT_PAUSE_MS = 60_000

export interface MetadataServiceOptions {
  repository: Repository
  mediaDirectory: string
  fetch: FetchLike
  getRawgKey: () => string | null
  onProgress: (progress: MetadataProgress) => void
  onGameChanged: () => void
}

type Match = { source: 'steam'; appId: number } | { source: 'rawg'; id: number; slug: string }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Store names carry trademark symbols ("Call of Duty®: Black Ops III"). */
export function cleanStoreName(name: string): string {
  return name.replace(/[™®©]/g, '').replace(/\s{2,}/g, ' ').trim()
}

function extensionFor(contentType: string | null, url: string): string {
  if (contentType?.includes('png')) return '.png'
  if (contentType?.includes('webp')) return '.webp'
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return '.jpg'
  const fromUrl = path.extname(new URL(url).pathname).toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.webp'].includes(fromUrl) ? fromUrl : '.jpg'
}

/**
 * Finds every game on a public catalog and caches its artwork on disk.
 * Steam first (no key, best artwork), RAWG for games that are not on Steam.
 */
export class MetadataService {
  private readonly steam: SteamClient
  private running = false
  private rerunRequested = false
  private progress: MetadataProgress = { running: false, done: 0, total: 0, currentTitle: null }
  private lastSteamRequest = 0

  constructor(private readonly options: MetadataServiceOptions) {
    this.steam = new SteamClient((url, init) => this.throttledSteamFetch(url, init))
  }

  getProgress(): MetadataProgress {
    return this.progress
  }

  /** Looks up every game that has no info yet. Safe to call repeatedly; runs one batch at a time. */
  async runPending(): Promise<void> {
    if (this.running) {
      this.rerunRequested = true
      return
    }
    this.running = true
    try {
      do {
        this.rerunRequested = false
        await this.processQueue()
      } while (this.rerunRequested)
    } finally {
      this.running = false
      this.report({ running: false, done: this.progress.total, total: this.progress.total, currentTitle: null })
    }
  }

  private async processQueue(): Promise<void> {
    const queue = this.options.repository.gamesNeedingMetadata()
    if (queue.length === 0) return
    let done = 0
    this.report({ running: true, done, total: queue.length, currentTitle: queue[0]!.title })

    for (const game of queue) {
      this.report({ running: true, done, total: queue.length, currentTitle: game.title })
      try {
        const match = await this.findMatch(game)
        if (match) {
          const metadata = await this.fetchMetadata(game.id, match)
          this.options.repository.setMetadata(game.id, metadata, metadata ? 'matched' : 'not_found')
        } else {
          this.options.repository.setMetadata(game.id, null, 'not_found')
        }
        this.options.onGameChanged()
      } catch (error) {
        if (error instanceof RateLimitError) {
          log.warn(`${error.message}; pausing metadata lookups for a minute`)
          await sleep(RATE_LIMIT_PAUSE_MS)
        } else {
          // Network problems leave the game pending so the next start tries again.
          log.warn(`Metadata lookup failed for "${game.title}"`, error)
        }
      }
      done++
    }
    this.report({ running: true, done, total: queue.length, currentTitle: null })
  }

  // ---------------------------------------------------------------- matching

  async findMatch(game: Pick<Game, 'title' | 'searchTitle' | 'folderName'>): Promise<Match | null> {
    const steam = await this.findOnSteam(game)
    if (steam) return steam
    return this.findOnRawg(game)
  }

  private async findOnSteam(game: Pick<Game, 'title' | 'searchTitle'>): Promise<Match | null> {
    const tried = new Set<number>()
    for (const query of searchQueries(game.title, game.searchTitle)) {
      const results = await this.steam.search(query)
      const ranked = results
        .map((item) => ({ item, score: Math.max(matchScore(item.name, game.title), matchScore(item.name, game.searchTitle)) }))
        .filter(({ item, score }) => score >= ACCEPT_SCORE && !tried.has(item.appId))
        .sort((a, b) => b.score - a.score)

      for (const { item } of ranked.slice(0, 3)) {
        tried.add(item.appId)
        const details = await this.steam.details(item.appId)
        // Search results include DLCs, soundtracks and demos. Only accept the base game.
        if (details && details.type === 'game') return { source: 'steam', appId: item.appId }
      }
    }
    return null
  }

  private async findOnRawg(game: Pick<Game, 'title' | 'searchTitle'>): Promise<Match | null> {
    const rawg = this.rawg()
    if (!rawg) return null
    for (const query of searchQueries(game.title, game.searchTitle).slice(0, 3)) {
      const results = await rawg.search(query)
      let best: { item: RawgSearchItem; score: number } | null = null
      for (const item of results) {
        const score = Math.max(matchScore(item.name, game.title), matchScore(item.name, game.searchTitle))
        if (!best || score > best.score) best = { item, score }
      }
      if (best && best.score >= ACCEPT_SCORE) return { source: 'rawg', id: best.item.id, slug: best.item.slug }
    }
    return null
  }

  // ---------------------------------------------------------------- fetching

  private async fetchMetadata(gameId: number, match: Match): Promise<GameMetadata | null> {
    return match.source === 'steam' ? this.fromSteam(gameId, match.appId) : this.fromRawg(gameId, match.id)
  }

  private async fromSteam(gameId: number, appId: number): Promise<GameMetadata | null> {
    const details = await this.steam.details(appId)
    if (!details) return null
    const [reviews, artwork] = await Promise.all([this.steam.reviews(appId), this.steam.artwork(appId)])

    const directory = this.resetGameMedia(gameId)
    const fallbackWide = [details.headerImage].filter((url): url is string => url !== null)
    const coverFile = await this.downloadFirst([...artwork.cover, ...fallbackWide], directory, 'cover')
    const heroFile = await this.downloadFirst(
      [...artwork.hero, details.backgroundImage, ...details.screenshots.slice(0, 1), ...fallbackWide].filter((url): url is string => Boolean(url)),
      directory,
      'hero'
    )
    const logoFile = await this.downloadFirst(artwork.logo, directory, 'logo')
    const screenshotFiles: string[] = []
    for (const [index, url] of details.screenshots.slice(0, MAX_SCREENSHOTS).entries()) {
      const file = await this.downloadFirst([url], directory, `shot-${index + 1}`)
      if (file) screenshotFiles.push(file)
    }

    return {
      source: 'steam',
      externalId: String(appId),
      name: cleanStoreName(details.name),
      shortDescription: details.shortDescription,
      description: details.description,
      releaseDate: details.releaseDate,
      genres: details.genres,
      developers: details.developers,
      publishers: details.publishers,
      rating: reviews.rating,
      ratingLabel: reviews.label,
      ratingCount: reviews.count,
      metacritic: details.metacritic,
      storeUrl: `https://store.steampowered.com/app/${appId}`,
      coverFile,
      heroFile,
      logoFile,
      screenshotFiles
    }
  }

  private async fromRawg(gameId: number, id: number): Promise<GameMetadata | null> {
    const rawg = this.rawg()
    if (!rawg) return null
    const details = await rawg.details(id)
    if (!details) return null
    const directory = this.resetGameMedia(gameId)
    const images = [details.backgroundImage, details.backgroundImageAdditional].filter((url): url is string => url !== null)
    const heroFile = await this.downloadFirst(images, directory, 'hero')
    const coverFile = await this.downloadFirst(images, directory, 'cover')

    return {
      source: 'rawg',
      externalId: String(id),
      name: cleanStoreName(details.name),
      shortDescription: details.description ? details.description.split('\n')[0]!.slice(0, 300) : null,
      description: details.description,
      releaseDate: details.released,
      genres: details.genres,
      developers: details.developers,
      publishers: details.publishers,
      rating: details.rating,
      ratingLabel: null,
      ratingCount: details.ratingCount,
      metacritic: details.metacritic,
      storeUrl: `https://rawg.io/games/${details.slug}`,
      coverFile,
      heroFile,
      logoFile: null,
      screenshotFiles: []
    }
  }

  // ---------------------------------------------------------------- manual fixes

  async search(query: string): Promise<MetadataCandidate[]> {
    const trimmed = query.trim()
    if (trimmed.length < 2) return []
    const candidates: MetadataCandidate[] = []
    const steamResults: SteamSearchItem[] = await this.steam.search(trimmed).catch(() => [])
    for (const item of steamResults) {
      candidates.push({ source: 'steam', externalId: String(item.appId), name: item.name, imageUrl: item.imageUrl, released: null })
    }
    const rawg = this.rawg()
    if (rawg) {
      const rawgResults = await rawg.search(trimmed).catch(() => [] as RawgSearchItem[])
      for (const item of rawgResults.slice(0, 6)) {
        candidates.push({ source: 'rawg', externalId: String(item.id), name: item.name, imageUrl: item.imageUrl, released: item.released })
      }
    }
    return candidates
  }

  async assign(gameId: number, source: MetadataSource, externalId: string): Promise<void> {
    const numericId = Number(externalId)
    if (!Number.isInteger(numericId) || numericId <= 0) throw new Error('Invalid catalog id')
    const metadata = source === 'steam' ? await this.fromSteam(gameId, numericId) : await this.fromRawg(gameId, numericId)
    if (!metadata) throw new Error('Could not load that game. Try another result.')
    this.options.repository.setMetadata(gameId, metadata, 'matched', true)
  }

  clear(gameId: number): void {
    this.resetGameMedia(gameId)
    this.options.repository.setMetadata(gameId, null, 'not_found', true)
  }

  async refresh(gameId: number): Promise<void> {
    const game = this.options.repository.getGame(gameId)
    if (!game) throw new Error('Game not found')
    if (game.metadata) {
      await this.assign(gameId, game.metadata.source, game.metadata.externalId)
      return
    }
    const match = await this.findMatch(game)
    if (!match) {
      this.options.repository.setMetadata(gameId, null, 'not_found')
      throw new Error('No match found. Search for the game by name instead.')
    }
    const metadata = await this.fetchMetadata(gameId, match)
    this.options.repository.setMetadata(gameId, metadata, metadata ? 'matched' : 'not_found')
  }

  // ---------------------------------------------------------------- helpers

  private rawg(): RawgClient | null {
    const key = this.options.getRawgKey()
    return key ? new RawgClient(this.options.fetch, key) : null
  }

  /** Steam limits anonymous store requests, so they are spaced out. */
  private async throttledSteamFetch(url: string, init?: { headers?: Record<string, string> }): Promise<Response> {
    const wait = this.lastSteamRequest + STEAM_REQUEST_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    this.lastSteamRequest = Date.now()
    return this.options.fetch(url, init)
  }

  private gameMediaDirectory(gameId: number): string {
    return path.join(this.options.mediaDirectory, String(gameId))
  }

  private resetGameMedia(gameId: number): string {
    const directory = this.gameMediaDirectory(gameId)
    rmSync(directory, { recursive: true, force: true })
    mkdirSync(directory, { recursive: true })
    return directory
  }

  /** Downloads the first URL that answers with a real image. Returns the saved file name. */
  private async downloadFirst(urls: string[], directory: string, baseName: string): Promise<string | null> {
    for (const url of [...new Set(urls)]) {
      try {
        const response = await this.options.fetch(url)
        if (!response.ok) continue
        const contentType = response.headers.get('content-type')
        if (contentType && !contentType.startsWith('image/')) continue
        const bytes = Buffer.from(await response.arrayBuffer())
        if (bytes.length < 2048) continue
        const fileName = `${baseName}${extensionFor(contentType, url)}`
        writeFileSync(path.join(directory, fileName), bytes)
        return fileName
      } catch {
        continue
      }
    }
    return null
  }

  private report(progress: MetadataProgress): void {
    this.progress = progress
    this.options.onProgress(progress)
  }
}
