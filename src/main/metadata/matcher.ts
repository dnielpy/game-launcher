import { normalizeForComparison } from '../scanner/nameCleaner'
import { diceSimilarity } from '../scanner/similarity'

/** Score at or above which a catalog result is accepted without asking. */
export const ACCEPT_SCORE = 0.7

const ROMAN: Record<string, string> = {
  ii: '2',
  iii: '3',
  iv: '4',
  v: '5',
  vi: '6',
  vii: '7',
  viii: '8',
  ix: '9',
  x: '10',
  xi: '11',
  xii: '12'
}

/** Words that mark a store entry that is not the base game. */
const NON_GAME_WORDS =
  /\b(soundtrack|ost|dlc|expansion|season pass|pass|pack|upgrade|demo|playtest|beta|test server|dedicated server|server|sdk|tool|toolkit|editor|artbook|art book|wallpaper|costume|skin|bonus|bundle|trailer|benchmark|vr)\b/

/** Normalized tokens with roman numerals turned into digits, so "Black Ops III" equals "Black Ops 3". */
export function matchTokens(value: string): string[] {
  return normalizeForComparison(value)
    .split(' ')
    .filter((token) => token.length > 0)
    .map((token, index) => (index > 0 && ROMAN[token] ? ROMAN[token]! : token))
}

function isPrefix(short: string[], long: string[]): boolean {
  if (short.length === 0 || short.length > long.length) return false
  return short.every((token, index) => long[index] === token)
}

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((token, index) => haystack[start + index] === token)) return true
  }
  return false
}

/**
 * How well a catalog name fits a title found on disk, between 0 and 1.
 *
 * - Same words: 1.
 * - Catalog name is the start of our title ("Forza Horizon 5" for "Forza Horizon 5 Premium Edition"):
 *   high, and higher the more of our title it covers.
 * - Our title is the start of the catalog name, or sits inside it ("FIFA 23" in "EA SPORTS FIFA 23"): medium.
 * - Otherwise, fuzzy similarity, only when very close.
 * Catalog entries that are DLCs, soundtracks or tools lose points unless our title says the same.
 */
export function matchScore(catalogName: string, title: string): number {
  const candidate = matchTokens(catalogName)
  const ours = matchTokens(title)
  if (candidate.length === 0 || ours.length === 0) return 0

  let score: number
  if (candidate.join(' ') === ours.join(' ')) {
    score = 1
  } else if (isPrefix(candidate, ours)) {
    score = 0.62 + 0.36 * (candidate.length / ours.length)
    // "Forza Horizon" for "Forza Horizon 6": the word after the match is a sequel number.
    if (/^\d+$/.test(ours[candidate.length] ?? '')) score -= 0.4
  } else if (isPrefix(ours, candidate)) {
    score = 0.5 + 0.3 * (ours.length / candidate.length)
  } else if (containsSequence(candidate, ours)) {
    score = 0.55 + 0.3 * (ours.length / candidate.length)
  } else {
    const dice = diceSimilarity(candidate.join(' '), ours.join(' '))
    score = dice >= 0.85 ? dice * 0.9 : dice * 0.5
  }

  // Different sequel numbers are different games: "Forza Horizon 5" is not "Forza Horizon 6".
  const candidateNumbers = candidate.filter((token) => /^\d+$/.test(token))
  const ourNumbers = ours.filter((token) => /^\d+$/.test(token))
  if (candidateNumbers.length > 0 && ourNumbers.length > 0 && !candidateNumbers.some((token) => ourNumbers.includes(token))) score -= 0.5

  const candidateText = candidate.join(' ')
  const oursText = ours.join(' ')
  if (NON_GAME_WORDS.test(candidateText) && !NON_GAME_WORDS.test(oursText)) score -= 0.35

  return Math.max(0, Math.min(1, score))
}

export interface Scored<T> {
  item: T
  score: number
}

/** Best result for a title, or null when nothing reaches the acceptance score. Ties keep the catalog's own order. */
export function pickBest<T>(items: T[], nameOf: (item: T) => string, title: string): Scored<T> | null {
  let best: Scored<T> | null = null
  for (const item of items) {
    const score = matchScore(nameOf(item), title)
    if (!best || score > best.score + 1e-9) best = { item, score }
  }
  return best && best.score >= ACCEPT_SCORE ? best : null
}

/**
 * Search terms to try, most specific first: the full title, the title without
 * edition words, then shorter prefixes for names with leftover noise.
 */
export function searchQueries(displayTitle: string, searchTitle: string): string[] {
  const queries: string[] = []
  const add = (value: string) => {
    const trimmed = value.trim()
    if (trimmed.length > 1 && !queries.some((query) => query.toLowerCase() === trimmed.toLowerCase())) queries.push(trimmed)
  }
  add(displayTitle)
  add(searchTitle)
  const words = searchTitle.split(/\s+/).filter(Boolean)
  for (let length = words.length - 1; length >= 2 && queries.length < 5; length--) add(words.slice(0, length).join(' '))
  return queries
}
