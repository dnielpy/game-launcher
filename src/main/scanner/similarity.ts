import { normalizeForComparison } from './nameCleaner'

/** Words that add nothing when comparing an exe name with a game title. */
const NOISE_TOKENS = new Set(['the', 'a', 'of', 'and', 'game', 'win64', 'win32', 'shipping', 'x64', 'x86', 'dx11', 'dx12', 'exe'])

function tokens(value: string): string[] {
  // Split camelCase and digit boundaries so "HollowKnight2" matches "Hollow Knight 2".
  const spaced = value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([a-zA-Z])(\d)/g, '$1 $2').replace(/(\d)([a-zA-Z])/g, '$1 $2')
  return normalizeForComparison(spaced)
    .split(' ')
    .filter((token) => token.length > 0 && !NOISE_TOKENS.has(token))
}

function bigrams(value: string): Map<string, number> {
  const compact = value.replace(/\s+/g, '')
  const result = new Map<string, number>()
  for (let i = 0; i < compact.length - 1; i++) {
    const gram = compact.slice(i, i + 2)
    result.set(gram, (result.get(gram) ?? 0) + 1)
  }
  return result
}

/** Sørensen–Dice coefficient over character bigrams. 0 = unrelated, 1 = identical. */
export function diceSimilarity(a: string, b: string): number {
  const left = tokens(a).join(' ')
  const right = tokens(b).join(' ')
  if (left.length === 0 || right.length === 0) return 0
  if (left === right) return 1
  const leftGrams = bigrams(left)
  const rightGrams = bigrams(right)
  let overlap = 0
  let leftTotal = 0
  let rightTotal = 0
  for (const count of leftGrams.values()) leftTotal += count
  for (const count of rightGrams.values()) rightTotal += count
  for (const [gram, count] of leftGrams) {
    overlap += Math.min(count, rightGrams.get(gram) ?? 0)
  }
  if (leftTotal + rightTotal === 0) return 0
  return (2 * overlap) / (leftTotal + rightTotal)
}

/** Acronym match: "gtav" vs "Grand Theft Auto V", "rdr2" vs "Red Dead Redemption 2". */
export function acronymMatches(short: string, long: string): boolean {
  const shortCompact = normalizeForComparison(short).replace(/\s+/g, '')
  const longTokens = tokens(long)
  if (shortCompact.length < 2 || longTokens.length < 2) return false
  const acronym = longTokens.map((token) => (/^\d+$/.test(token) ? token : token[0])).join('')
  return acronym === shortCompact
}

/** Best of fuzzy similarity and acronym matching, between 0 and 1. */
export function nameSimilarity(candidate: string, title: string): number {
  if (acronymMatches(candidate, title)) return 0.9
  return diceSimilarity(candidate, title)
}
