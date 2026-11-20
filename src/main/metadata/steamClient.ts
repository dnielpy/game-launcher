import type { GameRequirements } from '@shared/types'
import { parseSteamRequirements } from './requirements'
/**
 * Public Steam store endpoints. None of them need an API key.
 *
 * - storesearch: name search
 * - appdetails: description, genres, developers, release date, Metacritic, screenshots
 * - appreviews: share of positive user reviews
 * - IStoreBrowseService/GetItems: library artwork (vertical cover, hero banner, logo)
 */

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>

const STORE = 'https://store.steampowered.com'
const API = 'https://api.steampowered.com'
const ASSETS = 'https://shared.cloudflare.steamstatic.com/store_item_assets/'

export interface SteamSearchItem {
  appId: number
  name: string
  imageUrl: string | null
}

export interface SteamDetails {
  appId: number
  name: string
  type: string
  shortDescription: string | null
  description: string | null
  releaseDate: string | null
  comingSoon: boolean
  genres: string[]
  developers: string[]
  publishers: string[]
  metacritic: number | null
  headerImage: string | null
  backgroundImage: string | null
  screenshots: string[]
  requirements: GameRequirements | null
}

export interface SteamReviews {
  rating: number | null
  label: string | null
  count: number | null
}

export interface SteamArtwork {
  cover: string[]
  hero: string[]
  logo: string[]
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value) : value
  return typeof number === 'number' && Number.isFinite(number) ? number : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Turns the store's HTML description into plain paragraphs. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h\d|li|div)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function parseSearch(json: unknown): SteamSearchItem[] {
  const items = asArray(asRecord(json)?.['items'])
  const results: SteamSearchItem[] = []
  for (const raw of items) {
    const item = asRecord(raw)
    const appId = asNumber(item?.['id'])
    const name = asString(item?.['name'])
    if (!item || appId === null || !name) continue
    if (item['type'] !== undefined && item['type'] !== 'app') continue
    results.push({ appId, name, imageUrl: asString(item['tiny_image']) })
  }
  return results
}

export function parseDetails(json: unknown, appId: number): SteamDetails | null {
  const entry = asRecord(asRecord(json)?.[String(appId)])
  if (!entry || entry['success'] !== true) return null
  const data = asRecord(entry['data'])
  const name = asString(data?.['name'])
  if (!data || !name) return null

  const release = asRecord(data['release_date'])
  const longHtml = asString(data['about_the_game']) ?? asString(data['detailed_description'])
  const description = longHtml ? htmlToText(longHtml).slice(0, 6000) : null
  const shortHtml = asString(data['short_description'])

  return {
    appId,
    name,
    type: asString(data['type']) ?? 'game',
    shortDescription: shortHtml ? htmlToText(shortHtml) : null,
    description,
    releaseDate: asString(release?.['date']),
    comingSoon: release?.['coming_soon'] === true,
    genres: asArray(data['genres'])
      .map((genre) => asString(asRecord(genre)?.['description']))
      .filter((genre): genre is string => genre !== null),
    developers: asArray(data['developers']).map(asString).filter((value): value is string => value !== null),
    publishers: asArray(data['publishers']).map(asString).filter((value): value is string => value !== null),
    metacritic: asNumber(asRecord(data['metacritic'])?.['score']),
    headerImage: asString(data['header_image']),
    backgroundImage: asString(data['background_raw']) ?? asString(data['background']),
    screenshots: asArray(data['screenshots'])
      .map((shot) => asString(asRecord(shot)?.['path_full']))
      .filter((url): url is string => url !== null),
    requirements: parseSteamRequirements(data['pc_requirements'])
  }
}

export function parseReviews(json: unknown): SteamReviews {
  const summary = asRecord(asRecord(json)?.['query_summary'])
  const positive = asNumber(summary?.['total_positive'])
  const total = asNumber(summary?.['total_reviews'])
  const label = asString(summary?.['review_score_desc'])
  if (!summary || total === null || total === 0 || positive === null) return { rating: null, label: null, count: total }
  return { rating: Math.round((positive / total) * 100), label: label && !/^\d+ user reviews?$/i.test(label) ? label : null, count: total }
}

/**
 * Artwork URLs to try, best first. Newer games keep their library art under a
 * hashed folder that only GetItems reveals; older ones also answer at the plain path.
 */
export function parseArtwork(json: unknown, appId: number): SteamArtwork {
  const plain = (file: string) => `${ASSETS}steam/apps/${appId}/${file}`
  const artwork: SteamArtwork = {
    cover: [],
    hero: [],
    logo: []
  }

  const item = asRecord(asArray(asRecord(asRecord(json)?.['response'])?.['store_items'])[0])
  const assets = asRecord(item?.['assets'])
  const format = asString(assets?.['asset_url_format'])
  if (assets && format) {
    const build = (key: string) => {
      const file = asString(assets[key])
      return file ? ASSETS + format.replace('${FILENAME}', file) : null
    }
    for (const key of ['library_capsule_2x', 'library_capsule']) {
      const url = build(key)
      if (url) artwork.cover.push(url)
    }
    for (const key of ['library_hero_2x', 'library_hero']) {
      const url = build(key)
      if (url) artwork.hero.push(url)
    }
    for (const key of ['library_logo_2x', 'library_logo']) {
      const url = build(key)
      if (url) artwork.logo.push(url)
    }
  }

  artwork.cover.push(plain('library_600x900_2x.jpg'), plain('library_600x900.jpg'))
  artwork.hero.push(plain('library_hero.jpg'))
  artwork.logo.push(plain('logo.png'))
  return artwork
}

export class SteamClient {
  private readonly detailsCache = new Map<number, SteamDetails | null>()

  constructor(private readonly fetchImpl: FetchLike) {}

  private async json(url: string): Promise<unknown> {
    const response = await this.fetchImpl(url, { headers: { Accept: 'application/json' } })
    if (response.status === 429) throw new RateLimitError('Steam')
    if (!response.ok) throw new Error(`Steam answered ${response.status} for ${url}`)
    return response.json()
  }

  async search(term: string): Promise<SteamSearchItem[]> {
    const url = `${STORE}/api/storesearch/?term=${encodeURIComponent(term)}&cc=us&l=english`
    return parseSearch(await this.json(url))
  }

  async details(appId: number): Promise<SteamDetails | null> {
    if (this.detailsCache.has(appId)) return this.detailsCache.get(appId)!
    const details = parseDetails(await this.json(`${STORE}/api/appdetails?appids=${appId}&cc=us&l=english`), appId)
    if (this.detailsCache.size > 100) this.detailsCache.clear()
    this.detailsCache.set(appId, details)
    return details
  }

  async reviews(appId: number): Promise<SteamReviews> {
    try {
      return parseReviews(await this.json(`${STORE}/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0`))
    } catch {
      return { rating: null, label: null, count: null }
    }
  }

  async artwork(appId: number): Promise<SteamArtwork> {
    const input = {
      ids: [{ appid: appId }],
      context: { language: 'english', country_code: 'US' },
      data_request: { include_assets: true }
    }
    try {
      const url = `${API}/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`
      return parseArtwork(await this.json(url), appId)
    } catch {
      return parseArtwork(null, appId)
    }
  }
}

export class RateLimitError extends Error {
  constructor(service: string) {
    super(`${service} asked to slow down`)
    this.name = 'RateLimitError'
  }
}
