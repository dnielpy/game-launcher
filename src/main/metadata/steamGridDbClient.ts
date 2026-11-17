import { RateLimitError, type FetchLike } from './steamClient'

/**
 * SteamGridDB: community artwork (vertical covers, banners, logos) for almost any game, consoles included.
 * Needs a free API key from steamgriddb.com/profile/preferences/api.
 */
const API = 'https://www.steamgriddb.com/api/v2'

export interface SteamGridDbGame {
  id: number
  name: string
  releaseYear: number | null
}

export interface SteamGridDbArtwork {
  cover: string[]
  hero: string[]
  logo: string[]
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

export function parseSteamGridDbSearch(json: unknown): SteamGridDbGame[] {
  const data = record(json)?.['data']
  if (!Array.isArray(data)) return []
  return data
    .map((raw) => {
      const item = record(raw)
      const id = item?.['id']
      const name = item?.['name']
      if (typeof id !== 'number' || typeof name !== 'string' || !name.trim()) return null
      const released = item?.['release_date']
      return { id, name: name.trim(), releaseYear: typeof released === 'number' ? new Date(released * 1000).getUTCFullYear() : null }
    })
    .filter((item): item is SteamGridDbGame => item !== null)
}

/** Image URLs, best first. Images flagged as jokes or not safe for work are skipped. */
export function parseSteamGridDbImages(json: unknown): string[] {
  const data = record(json)?.['data']
  if (!Array.isArray(data)) return []
  return data
    .map((raw) => record(raw))
    .filter((item): item is Record<string, unknown> => item !== null && item['nsfw'] !== true && item['humor'] !== true && item['epilepsy'] !== true)
    .sort((a, b) => (Number(b['score']) || 0) - (Number(a['score']) || 0))
    .map((item) => item['url'])
    .filter((url): url is string => typeof url === 'string' && url.startsWith('https://'))
}

export class SteamGridDbClient {
  constructor(
    private readonly fetchImpl: FetchLike,
    private readonly apiKey: string
  ) {}

  private async json(path: string): Promise<unknown> {
    const response = await this.fetchImpl(`${API}${path}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${this.apiKey}` } })
    if (response.status === 429) throw new RateLimitError('SteamGridDB')
    if (response.status === 401 || response.status === 403) throw new Error('The SteamGridDB key was rejected. Check it in Settings.')
    if (response.status === 404) return { data: [] }
    if (!response.ok) throw new Error(`SteamGridDB answered ${response.status}`)
    return response.json()
  }

  async search(term: string): Promise<SteamGridDbGame[]> {
    return parseSteamGridDbSearch(await this.json(`/search/autocomplete/${encodeURIComponent(term)}`))
  }

  async game(gameId: number): Promise<SteamGridDbGame | null> {
    const json = record(await this.json(`/games/id/${gameId}`))
    return parseSteamGridDbSearch({ data: json?.['data'] ? [json['data']] : [] })[0] ?? null
  }

  async artwork(gameId: number): Promise<SteamGridDbArtwork> {
    const [cover, hero, logo] = await Promise.all([
      this.json(`/grids/game/${gameId}?dimensions=600x900,342x482,660x930&types=static&nsfw=false&humor=false`),
      this.json(`/heroes/game/${gameId}?types=static&nsfw=false&humor=false`),
      this.json(`/logos/game/${gameId}?types=static&nsfw=false&humor=false`)
    ])
    return { cover: parseSteamGridDbImages(cover), hero: parseSteamGridDbImages(hero), logo: parseSteamGridDbImages(logo) }
  }
}
