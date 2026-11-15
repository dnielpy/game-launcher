/**
 * Turns messy folder, installer or registry names into a readable title.
 *
 *   "Cyberpunk.2077.v2.1.[FitGirl.Repack]"               -> "Cyberpunk 2077"
 *   "Forza Horizon 6 MULTi23 ElAmigos versión 354.221"   -> "Forza Horizon 6"
 *   "Grand Theft Auto V Enhanced 889.15"                 -> "Grand Theft Auto V Enhanced"
 *   "World of Warcraft 3.3.5a 12340 enUS"                -> "World of Warcraft"
 *
 * The display title keeps edition words; the search title drops them so the
 * metadata lookup gets a cleaner match. When a metadata match is found, its
 * official name replaces both.
 */

/** Release groups and tags that are never part of a title, wherever they appear. */
const NOISE_ANYWHERE = [
  'fitgirl',
  'fit girl',
  'fitgirl repack',
  'dodi',
  'dodi repack',
  'elamigos',
  'el amigos',
  'xatab',
  'r\\.g\\. mechanics',
  'rg mechanics',
  'repack',
  'repacked',
  'multi\\d+',
  'multi-?language',
  'multilang',
  'goldberg',
  'steamrip',
  'gog-?rip',
  'skidrow',
  'tinyiso',
  'razor1911',
  'razor 1911',
  'p2p',
  'x64',
  'x86',
  'win64',
  'win32',
  'full game',
  'crack(?:ed)?',
  'cracked by \\w+',
  'online fix',
  'preinstalled',
  'pre-installed',
  '(?:en|es|fr|de|it|pt|ru|pl|ja|ko|zh)(?:us|gb|es|mx|fr|de|it|br|pt|ru|pl|jp|kr|cn|tw)',
]

/** Group names that are also ordinary words. Only removed at the end of a name. */
const NOISE_TRAILING = [
  'codex',
  'cpy',
  'plaza',
  'reloaded',
  'empress',
  'flt',
  'fairlight',
  'tenoke',
  'rune',
  'hoodlum',
  'prophet',
  'darksiders',
  'kaos',
  'gog',
  'portable',
  'rip',
  'eng',
  'rus',
  'esp',
  'spa',
  'spanish',
  'english'
]

const NOISE_ANYWHERE_RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${NOISE_ANYWHERE.join('|')})(?![\\p{L}\\p{N}])`, 'giu')
const NOISE_TRAILING_RE = new RegExp(`[-_.\\s]+(?:${NOISE_TRAILING.join('|')})$`, 'i')

/** Bracketed or parenthesized chunks that only carry release noise. */
const NOISY_BRACKET = new RegExp(
  `[\\[(\\{][^\\])}]*(?:${[...NOISE_ANYWHERE, ...NOISE_TRAILING].join('|')}|v\\d|vers|build|update|dlc|rev\\s?\\d|\\d+(?:[.,]\\d+)?\\s?[gm]i?b|win|\\d+\\.\\d)[^\\])}]*[\\])}]`,
  'giu'
)

/** Everything from these words on is release noise: "Foo update 1.2 - 1.3", "Foo versión 2.12". */
const CUT_FROM_PATTERNS: RegExp[] = [
  /\s(?:update|upd|patch|hotfix|versi[oó]n|version|ver|build|rev(?:ision)?)\s*[\d.v]+\b.*$/iu,
  /\s(?:early\s?access)\b.*$/i,
  // "Cyberpunk 2077 2024 PC 300 MN": a standalone PC tag ends the title (unless the title starts with it).
  /\s+pc(?:\s.*)?$/i
]

const VERSION_PATTERNS: RegExp[] = [
  /(?<![\p{L}\p{N}])v\s?\d+(?:[._]\d+)*[a-z]?(?:\s?(?:hotfix|hf)\s?\d*)?(?![\p{L}\p{N}])/giu,
  /\bbuild\s?\d+(?:[._]\d+)*\b/gi,
  /\bupdate\s?\d+(?:[._]\d+)*\b/gi,
  /\bpatch\s?\d+(?:[._]\d+)*\b/gi,
  /\brev(?:ision)?\s?\d+\b/gi,
  // Dotted version numbers: 1.2.3, 3.3.5a, 360.259
  /(?<![\p{L}\p{N}.])\d+\.\d+(?:\.\d+)+[a-z]?(?![\p{L}\p{N}])/giu
]

const DLC_PATTERNS: RegExp[] = [
  /\+\s*\d+\s*dlcs?\b.*$/i,
  /\+\s*(?:all\s+)?dlcs?\b.*$/i,
  /\+\s*bonus(?:\s+content)?\b.*$/i,
  /\+\s*soundtrack\b.*$/i,
  /\+\s*ost\b.*$/i,
  /\+\s*multiplayer\b.*$/i,
  /\+\s*online\b.*$/i,
  /\+\s*\d+\s*(?:fixe?s?|patch(?:es)?)\b.*$/i,
  /\+\s*(?:update|crack|fix)\b.*$/i
]

/** Words that describe an edition. Kept for display, removed for search. */
const EDITION_PATTERN =
  /\b(?:game\s+of\s+the\s+year|goty|deluxe|ultimate|complete|gold|premium|digital\s+deluxe|collector'?s|legendary|standard|special|season\s+pass|bundle)\b(?:\s+edition)?|\bedition\b/gi

/** A trailing token that is only a number: a version (889.15), a build (12340) or a stray year after another number. */
function isTrailingNoiseNumber(token: string, previous: string | undefined): boolean {
  if (/^\d+[.,]\d+[a-z]?$/i.test(token)) return true
  if (/^\d{5,}$/.test(token)) return true
  if (/^-?\d+$/.test(token) && token.startsWith('-')) return true
  // "Cyberpunk 2077 2024": a year right after another number is a release date, not a sequel number.
  if (/^(?:19|20)\d{2}$/.test(token) && previous !== undefined && /^\d+$/.test(previous)) return true
  return false
}

function stripNoise(raw: string): string {
  let name = raw.trim()

  // Drop an extension if the input is a file name.
  name = name.replace(/\.(?:exe|iso|zip|rar|7z)$/i, '')

  name = name.replace(NOISY_BRACKET, ' ')

  // Dots and underscores used as separators ("Hades_II", "The.Witcher.3").
  // Dots inside numbers and acronyms ("S.T.A.L.K.E.R.") are kept.
  const DOT_PLACEHOLDER = '\u0001'
  name = name.replace(/\b(?:[A-Za-z]\.){2,}[A-Za-z]?\.?/g, (match) => match.replace(/\./g, DOT_PLACEHOLDER))
  name = name.replace(/_/g, ' ')
  name = name.replace(/\.(?!\d)/g, ' ').replace(/(?<!\d)\./g, ' ')
  name = name.split(DOT_PLACEHOLDER).join('.')

  for (const pattern of DLC_PATTERNS) name = name.replace(pattern, ' ')
  for (const pattern of CUT_FROM_PATTERNS) name = name.replace(pattern, ' ')
  for (const pattern of VERSION_PATTERNS) name = name.replace(pattern, ' ')
  name = name.replace(NOISE_ANYWHERE_RE, ' ')

  // Leftover brackets and trademark symbols.
  name = name.replace(/[\[\]{}()]/g, ' ')
  name = name.replace(/[™®©]/g, '')
  name = name.replace(/\s{2,}/g, ' ').trim()

  // Trailing junk, repeated until nothing changes: group names, separators, version numbers.
  for (let i = 0; i < 8; i++) {
    const before = name
    name = name.replace(NOISE_TRAILING_RE, '')
    name = name.replace(/[\s\-–—:+,]+$/, '')
    const tokens = name.split(' ')
    const last = tokens[tokens.length - 1]
    if (tokens.length > 1 && last !== undefined && isTrailingNoiseNumber(last, tokens[tokens.length - 2])) {
      tokens.pop()
      name = tokens.join(' ')
    }
    if (name === before) break
  }

  // Separators left dangling at the start or doubled in the middle.
  name = name.replace(/^\s*[-–—:+]\s+/g, '')
  name = name.replace(/\s+[-–—]\s+/g, ' ')
  name = name.replace(/\s+-\s*$/g, '')
  name = name.replace(/\s{2,}/g, ' ').trim()

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
    .replace(/[̀-ͯ]/g, '')
    .replace(/[™®©]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** True for names like "Foo update 1.2 - 1.3" or "Foo Patch 5": a game update, not the game. */
export function looksLikeUpdateName(raw: string): boolean {
  const name = raw.replace(/[._]/g, ' ')
  return /\b(?:update|upd|patch|hotfix)\b\s*(?:v?\d|from|to|\d+[.,]\d)/i.test(name) || /\bupdate\s*(?:only|pack)\b/i.test(name)
}
