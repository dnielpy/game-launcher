import { describe, expect, it } from 'vitest'
import { parseRawgDetails, parseRawgSearch } from '../src/main/metadata/rawgClient'
import { htmlToText, parseArtwork, parseDetails, parseReviews, parseSearch } from '../src/main/metadata/steamClient'

describe('steam parsers', () => {
  it('reads search results and skips non-apps', () => {
    const results = parseSearch({
      total: 2,
      items: [
        { type: 'app', name: 'Forza Horizon 5', id: 1551360, tiny_image: 'https://img/1.jpg' },
        { type: 'sub', name: 'Bundle', id: 1 },
        { type: 'app', name: '', id: 3 }
      ]
    })
    expect(results).toEqual([{ appId: 1551360, name: 'Forza Horizon 5', imageUrl: 'https://img/1.jpg' }])
  })

  it('reads app details', () => {
    const details = parseDetails(
      {
        '1551360': {
          success: true,
          data: {
            type: 'game',
            name: 'Forza Horizon 5',
            short_description: 'Your <b>ultimate</b> adventure &amp; more',
            about_the_game: '<h2>About</h2><p>Explore Mexico.<br>Drive.</p><ul><li>Cars</li></ul>',
            developers: ['Playground Games'],
            publishers: ['Xbox Game Studios'],
            genres: [{ id: '9', description: 'Racing' }],
            release_date: { coming_soon: false, date: 'Nov 8, 2021' },
            metacritic: { score: 92 },
            header_image: 'https://img/header.jpg',
            screenshots: [{ path_full: 'https://img/s1.jpg' }]
          }
        }
      },
      1551360
    )
    expect(details).toMatchObject({
      name: 'Forza Horizon 5',
      shortDescription: 'Your ultimate adventure & more',
      releaseDate: 'Nov 8, 2021',
      genres: ['Racing'],
      metacritic: 92,
      screenshots: ['https://img/s1.jpg']
    })
    expect(details?.description).toBe('About\nExplore Mexico.\nDrive.\n• Cars')
  })

  it('returns null for failed lookups', () => {
    expect(parseDetails({ '5': { success: false } }, 5)).toBeNull()
    expect(parseDetails(null, 5)).toBeNull()
  })

  it('turns reviews into a percentage', () => {
    expect(parseReviews({ query_summary: { total_positive: 900, total_reviews: 1000, review_score_desc: 'Very Positive' } })).toEqual({
      rating: 90,
      label: 'Very Positive',
      count: 1000
    })
    expect(parseReviews({ query_summary: { total_reviews: 0 } }).rating).toBeNull()
  })

  it('builds artwork URLs from hashed assets, with plain fallbacks', () => {
    const artwork = parseArtwork(
      {
        response: {
          store_items: [
            { assets: { asset_url_format: 'steam/apps/10/abc123/${FILENAME}?t=1', library_capsule_2x: 'library_600x900_2x.jpg', library_hero: 'library_hero.jpg' } }
          ]
        }
      },
      10
    )
    expect(artwork.cover[0]).toBe('https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/10/abc123/library_600x900_2x.jpg?t=1')
    expect(artwork.cover).toContain('https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/10/library_600x900.jpg')
    expect(artwork.hero[0]).toContain('/abc123/library_hero.jpg')
    expect(parseArtwork(null, 10).logo).toEqual(['https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/10/logo.png'])
  })

  it('cleans HTML entities and tags', () => {
    expect(htmlToText('A&nbsp;&quot;B&quot;<br/>C')).toBe('A "B"\nC')
  })
})

describe('rawg parsers', () => {
  it('reads search results and details', () => {
    expect(parseRawgSearch({ results: [{ id: 1, slug: 'wow', name: 'World of Warcraft', released: '2004-11-23', background_image: 'x' }] })).toEqual([
      { id: 1, slug: 'wow', name: 'World of Warcraft', released: '2004-11-23', imageUrl: 'x' }
    ])
    const details = parseRawgDetails({ id: 1, slug: 'wow', name: 'World of Warcraft', rating: 4.2, description_raw: 'MMO', genres: [{ name: 'RPG' }] })
    expect(details).toMatchObject({ rating: 84, genres: ['RPG'], description: 'MMO' })
  })
})
