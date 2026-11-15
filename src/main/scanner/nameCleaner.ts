/**
 * Turns messy folder or installer names into a readable title.
 *
 *   "Cyberpunk.2077.v2.1.[FitGirl.Repack]"        -> "Cyberpunk 2077"
 *   "ELDEN RING - Deluxe Edition v1.10 + 2 DLCs"  -> "ELDEN RING Deluxe Edition"
 *   "Hades_II_Build_12345-GOG"                    -> "Hades II"
 *
 * The display title keeps edition words; the search title drops them so the
 * metadata lookup gets a cleaner match.
 */

const RELEASE_GROUPS = [
  'fitgirl',
  'fit girl',
  'dodi',
  'elamigos',
  'kaos',
  'xatab',
  'r\\.g\\. mechanics',
  'rg mechanics',
  'codex',
  'cpy',
  'plaza',
  'skidrow',
  'reloaded',
  'empress',
  'flt',
  'fairlight',
  'tenoke',
  'rune',
  'razor1911',
  'razor 1911',
  'hoodlum',
  'prophet',
  'tinyiso',
  'darksiders',
  'p2p',
  'gog',
  'goldberg',
  'repack',
  'portable',
  'multi\\d*',
  'multilanguage',
  'multi-language'
]

const GROUP_ALTERNATION = RELEASE_GROUPS.join('|')

/** Bracketed or parenthesized chunks that only carry release noise. */
const NOISY_BRACKET = new RegExp(
  `[\\[(\\{][^\\])}]*(?:${GROUP_ALTERNATION}|v\\d|build|update|dlc|rev\\s?\\d|\\d+\\s?gb|\\d+\\s?mb|x64|x86|win|eng|rus|esp)[^\\])}]*[\\])}]`,
  'gi'
)

const TRAILING_GROUP = new RegExp(`[-_.\\s]+(?:${GROUP_ALTERNATION})$`, 'i')

const VERSION_PATTERNS: RegExp[] = [
  /\bv(?:er(?:sion)?)?\s?\d+(?:[._]\d+)*(?:[a-z]\b)?(?:\s?(?:hotfix|hf)\s?\d*)?/gi,
  /\bbuild\s?\d+(?:[._]\d+)*\b/gi,
  /\bupdate\s?\d+(?:[._]\d+)*\b/gi,
  /\bpatch\s?\d+(?:[._]\d+)*\b/gi,
  /\brev(?:ision)?\s?\d+\b/gi,
  /\b\d+\.\d+\.\d+(?:\.\d+)*\b/g,
  /\b(?:early\s?access|ea)\b/gi
]

const DLC_PATTERNS: RegExp[] = [
  /\+\s*\d+\s*dlcs?\b.*$/i,
  /\+\s*(?:all\s+)?dlcs?\b.*$/i,
  /\+\s*bonus(?:\s+content)?\b.*$/i,
  /\+\s*soundtrack\b.*$/i,
  /\+\s*ost\b.*$/i,
  /\+\s*multiplayer\b.*$/i,
  /\+\s*online\b.*$/i,
  /\+\s*\d+\s*(?:fixe?s?|patch(?:es)?)\b.*$/i
]

/** Words that describe an edition. Kept for display, removed for search. */
const EDITION_PATTERN =
  /\b(?:game\s+of\s+the\s+year|goty|deluxe|ultimate|complete|definitive|gold|premium|digital\s+deluxe|collector'?s|enhanced|remastered|director'?s\s+cut|anniversary|legendary|standard|special|season\s+pass)\b(?:\s+edition)?|\bedition\b/gi

function stripNoise(raw: string): string {
  let name = raw.trim()

  // Drop an extension if the input is a file name.
  name = name.replace(/\.(?:exe|iso|zip|rar|7z)$/i, '')

  name = name.replace(NOISY_BRACKET, ' ')

  // Dots and underscores used as separators ("Hades_II", "The.Witcher.3").
  // Keep dots inside version numbers until versions are removed below.
  // Acronyms like "S.T.A.L.K.E.R." keep their dots.
  const DOT_PLACEHOLDER = '\u0001'
  name = name.replace(/\b(?:[A-Za-z]\.){2,}[A-Za-z]?\.?/g, (match) => match.replace(/\./g, DOT_PLACEHOLDER))
  name = name.replace(/_/g, ' ')
  name = name.replace(/\.(?!\d)/g, ' ').replace(/(?<!\d)\./g, ' ')
  name = name.split(DOT_PLACEHOLDER).join('.')

  for (const pattern of DLC_PATTERNS) name = name.replace(pattern, ' ')
  for (const pattern of VERSION_PATTERNS) name = name.replace(pattern, ' ')

  // Trailing "-GROUP" tags, repeated in case several are chained.
  for (let i = 0; i < 3; i++) {
    const next = name.trim().replace(TRAILING_GROUP, '')
    if (next === name.trim()) break
    name = next
  }

  // Leftover empty brackets and trademark symbols.
  name = name.replace(/[\[\]{}()]/g, ' ')
  name = name.replace(/[™®©]/g, '')

  // Separators left dangling at the edges or doubled in the middle.
  name = name.replace(/\s+[-–—:+]\s*$/g, '')
  name = name.replace(/^\s*[-–—:+]\s+/g, '')
  name = name.replace(/\s+[-–—]\s+/g, ' ')
  name = name.replace(/\s{2,}/g, ' ').trim()
  name = name.replace(/[-–—:+,]+$/, '').trim()

  return name
}

export function cleanDisplayTitle(raw: string): string {
  const cleaned = stripNoise(raw)
  return cleaned.length > 0 ? cleaned : raw.trim()
}

export function cleanSearchTitle(raw: string): string {
  const display = cleanDisplayTitle(raw)
  const withoutEdition = display
    .replace(EDITION_PATTERN, ' ')
    .replace(/\s+[-–—:]\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return withoutEdition.length > 0 ? withoutEdition : display
}

/** Lower-case, accent-free, alphanumeric tokens. Used for fuzzy comparisons. */
export function normalizeForComparison(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
