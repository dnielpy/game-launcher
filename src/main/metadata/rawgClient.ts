import { htmlToText, RateLimitError, type FetchLike } from './steamClient'

/**
 * RAWG video game database. Used for games that are not on Steam.
 * Needs a free personal API key; data shown from it must link back to rawg.io.
 */

const API = 'https://api.rawg.io/api'

export interface RawgSearchItem {
  id: number
  slug: string
  name: string
  released: string | null
  imageUrl: string | null
}

export interface RawgDetails {
  id: number
  slug: string
  name: string
  description: string | null
  released: string | null
  genres: string[]
  developers: string[]
  publishers: string[]
  rating: number | null
  ratingCount: number | null
  metacritic: number | null
  backgroundImage: string | null
  backgroundImageAdditional: string | null
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => text(record(entry)?.['name'])).filter((name): name is string => name !== null) : []
}

export function parseRawgSearch(json: unknown): RawgSearchItem[] {
  const results = record(json)?.['results']
  if (!Array.isArray(results)) return []
  return results
    .map((raw) => {
      const item = record(raw)
      const id = num(item?.['id'])
      const name = text(item?.['name'])
      const slug = text(item?.['slug'])
      if (!item || id === null || !name || !slug) return null
      return { id, slug, name, released: text(item['released']), imageUrl: text(item['background_image']) }
    })
    .filter((item): item is RawgSearchItem => item !== null)
}

export function parseRawgDetails(json: unknown): RawgDetails | null {
  const data = record(json)
  const id = num(data?.['id'])
  const name = text(data?.['name'])
  const slug = text(data?.['slug'])
  if (!data || id === null || !name || !slug) return null
  const rating = num(data['rating'])
  const raw = text(data['description_raw']) ?? text(data['description'])
  return {
    id,
    slug,
    name,
    description: raw ? htmlToText(raw).slice(0, 6000) : null,
    released: text(data['released']),
    genres: names(data['genres']),
    developers: names(data['developers']),
    publishers: names(data['publishers']),
    rating: rating !== null && rating > 0 ? Math.round(rating * 20) : null,
    ratingCount: num(data['ratings_count']),
    metacritic: num(data['metacritic']),
    backgroundImage: text(data['background_image']),
    backgroundImageAdditional: text(data['background_image_additional'])
  }
}

export class RawgClient {
  constructor(
    private readonly fetchImpl: FetchLike,
    private readonly apiKey: string
  ) {}

  private async json(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const query = new URLSearchParams({ ...params, key: this.apiKey })
    const response = await this.fetchImpl(`${API}${path}?${query.toString()}`, { headers: { Accept: 'application/json' } })
    if (response.status === 429) throw new RateLimitError('RAWG')
    if (response.status === 401) throw new Error('The RAWG key was rejected. Check it in Settings.')
    if (!response.ok) throw new Error(`RAWG answered ${response.status}`)
    return response.json()
  }

  /** RAWG platform ids: 4 is PC, 7 is Nintendo Switch. */
  async search(term: string, platform: 'pc' | 'switch' = 'pc'): Promise<RawgSearchItem[]> {
    return parseRawgSearch(await this.json('/games', { search: term, page_size: '8', platforms: platform === 'switch' ? '7' : '4' }))
  }

  async details(id: number): Promise<RawgDetails | null> {
    return parseRawgDetails(await this.json(`/games/${id}`))
  }
}
