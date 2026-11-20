import type { GameRequirements, HardwareInfo, RequirementItem } from './types'

/**
 * Rough gaming performance of graphics cards and processors, on one scale per kind (bigger is faster).
 * The numbers only need to put parts in the right order and roughly the right distance apart:
 * they decide whether this PC meets a game's minimum or recommended requirements.
 */

export type Verdict = 'good' | 'ok' | 'bad' | 'unknown'

export interface PartCheck {
  part: 'cpu' | 'gpu' | 'ram'
  label: string
  /** What this PC has, as shown to the user. */
  yours: string | null
  verdict: Verdict
}

export interface CompatibilityResult {
  overall: Verdict
  parts: PartCheck[]
}

// ---------------------------------------------------------------- graphics

const NVIDIA: Record<string, number> = {
  'gt 710': 3, 'gt 730': 5, 'gt 1030': 7, 'mx150': 9, 'mx250': 10, 'mx350': 11, 'mx450': 15, 'mx550': 17,
  'gtx 460': 9, 'gtx 470': 11, 'gtx 480': 13, 'gtx 550 ti': 7, 'gtx 560': 10, 'gtx 560 ti': 11, 'gtx 570': 13, 'gtx 580': 15,
  'gtx 650': 9, 'gtx 650 ti': 12, 'gtx 660': 17, 'gtx 660 ti': 19, 'gtx 670': 22, 'gtx 680': 24, 'gtx 690': 30,
  'gtx 750': 13, 'gtx 750 ti': 15, 'gtx 760': 21, 'gtx 770': 25, 'gtx 780': 30, 'gtx 780 ti': 35,
  'gtx 950': 19, 'gtx 960': 23, 'gtx 970': 33, 'gtx 980': 40, 'gtx 980 ti': 52,
  'gtx 1050': 18, 'gtx 1050 ti': 22, 'gtx 1060': 40, 'gtx 1070': 55, 'gtx 1070 ti': 62, 'gtx 1080': 68, 'gtx 1080 ti': 90,
  'gtx 1630': 17, 'gtx 1650': 30, 'gtx 1650 super': 38, 'gtx 1660': 46, 'gtx 1660 super': 53, 'gtx 1660 ti': 55,
  'rtx 2050': 35, 'rtx 2060': 70, 'rtx 2060 super': 82, 'rtx 2070': 85, 'rtx 2070 super': 97, 'rtx 2080': 105, 'rtx 2080 super': 112, 'rtx 2080 ti': 135,
  'rtx 3050': 60, 'rtx 3060': 85, 'rtx 3060 ti': 110, 'rtx 3070': 130, 'rtx 3070 ti': 138, 'rtx 3080': 165, 'rtx 3080 ti': 185, 'rtx 3090': 190, 'rtx 3090 ti': 205,
  'rtx 4050': 80, 'rtx 4060': 105, 'rtx 4060 ti': 130, 'rtx 4070': 175, 'rtx 4070 super': 205, 'rtx 4070 ti': 220, 'rtx 4070 ti super': 235, 'rtx 4080': 280, 'rtx 4080 super': 285, 'rtx 4090': 360,
  'rtx 5050': 100, 'rtx 5060': 135, 'rtx 5060 ti': 155, 'rtx 5070': 210, 'rtx 5070 ti': 270, 'rtx 5080': 310, 'rtx 5090': 420
}

const AMD: Record<string, number> = {
  'hd 5770': 8, 'hd 5850': 10, 'hd 5870': 12, 'hd 6850': 10, 'hd 6870': 12, 'hd 6950': 14, 'hd 6970': 15,
  'hd 7750': 10, 'hd 7770': 12, 'hd 7790': 14, 'hd 7850': 18, 'hd 7870': 21, 'hd 7950': 25, 'hd 7970': 28,
  'r7 260x': 14, 'r7 265': 17, 'r7 360': 13, 'r7 370': 19, 'r9 270': 20, 'r9 270x': 22, 'r9 280': 25, 'r9 280x': 28, 'r9 285': 27, 'r9 290': 35, 'r9 290x': 38,
  'r9 380': 28, 'r9 380x': 31, 'r9 390': 40, 'r9 390x': 43, 'r9 fury': 48, 'r9 fury x': 52,
  'rx 460': 16, 'rx 470': 30, 'rx 480': 35, 'rx 550': 12, 'rx 560': 18, 'rx 570': 34, 'rx 580': 38, 'rx 590': 42,
  'rx vega 56': 55, 'rx vega 64': 62, 'radeon vii': 80,
  'rx 5500 xt': 38, 'rx 5600 xt': 62, 'rx 5700': 70, 'rx 5700 xt': 78,
  'rx 6400': 30, 'rx 6500 xt': 35, 'rx 6600': 80, 'rx 6600 xt': 90, 'rx 6650 xt': 95, 'rx 6700': 100, 'rx 6700 xt': 115, 'rx 6750 xt': 120,
  'rx 6800': 150, 'rx 6800 xt': 170, 'rx 6900 xt': 185, 'rx 6950 xt': 195,
  'rx 7600': 95, 'rx 7600 xt': 100, 'rx 7700 xt': 150, 'rx 7800 xt': 175, 'rx 7900 gre': 190, 'rx 7900 xt': 240, 'rx 7900 xtx': 280,
  'rx 9060 xt': 150, 'rx 9070': 240, 'rx 9070 xt': 270,
  '680m': 26, '760m': 24, '780m': 30, '880m': 32, '890m': 38
}

const INTEL: Record<string, number> = {
  'hd graphics 4000': 3, 'hd graphics 4600': 4, 'hd graphics 520': 5, 'hd graphics 530': 5, 'hd graphics 620': 5, 'hd graphics 630': 6,
  'uhd graphics 620': 6, 'uhd graphics 630': 6, 'uhd graphics 730': 7, 'uhd graphics 770': 8, 'iris plus': 8, 'iris xe': 13,
  'arc a310': 22, 'arc a380': 30, 'arc a580': 65, 'arc a750': 80, 'arc a770': 88, 'arc b570': 95, 'arc b580': 110, 'arc graphics': 25
}

function normalizeGpu(text: string): string {
  return ` ${text.toLowerCase().replace(/geforce|radeon|nvidia|amd|intel\(r\)|intel|\(tm\)|\(r\)|®|™/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ')} `
}

/** Every graphics card named in a text, with its score. "GTX 1060 / RX 580" gives two. */
export function gpuScores(text: string): number[] {
  const value = normalizeGpu(text)
  const scores: number[] = []
  const add = (table: Record<string, number>, key: string, factor = 1) => {
    const score = table[key]
    if (score !== undefined) scores.push(score * factor)
  }
  const laptop = /\b(laptop|mobile|max q)\b/.test(value) ? 0.8 : 1

  for (const match of value.matchAll(/\b(rtx|gtx|gt)\s?(\d{3,4})\s?(ti super|super|ti)?\b/g)) {
    const suffix = match[3] ? ` ${match[3]}` : ''
    const key = `${match[1]} ${match[2]}${suffix}`
    if (NVIDIA[key] !== undefined) add(NVIDIA, key, laptop)
    else add(NVIDIA, `${match[1]} ${match[2]}`, laptop)
  }
  for (const match of value.matchAll(/\bmx\s?(\d{3})\b/g)) add(NVIDIA, `mx${match[1]}`)
  for (const match of value.matchAll(/\brx\s?(\d{3,4})\s?(xtx|xt|gre)?\b/g)) {
    const key = `rx ${match[1]}${match[2] ? ` ${match[2]}` : ''}`
    if (AMD[key] !== undefined) add(AMD, key, laptop)
    else add(AMD, `rx ${match[1]}`, laptop)
  }
  for (const match of value.matchAll(/\brx\s?vega\s?(56|64)\b|\bvega\s?(56|64)\b/g)) add(AMD, `rx vega ${match[1] ?? match[2]}`)
  if (/\bradeon vii\b|\s vii\s/.test(value) && /\bvii\b/.test(value)) add(AMD, 'radeon vii')
  for (const match of value.matchAll(/\b(r[79])\s?(\d{3})\s?(x)?\b/g)) add(AMD, `${match[1]} ${match[2]}${match[3] ?? ''}`)
  for (const match of value.matchAll(/\bhd\s?(\d{4})\b/g)) add(AMD, `hd ${match[1]}`)
  for (const match of value.matchAll(/\b(\d{3})m\b/g)) add(AMD, `${match[1]}m`)
  for (const match of value.matchAll(/\barc\s?([ab]\d{3})\b/g)) add(INTEL, `arc ${match[1]}`)
  if (/\biris xe\b/.test(value)) add(INTEL, 'iris xe')
  for (const match of value.matchAll(/\b(u?hd) graphics (\d{3,4})\b/g)) add(INTEL, `${match[1]} graphics ${match[2]}`)
  return scores
}

// ---------------------------------------------------------------- processors

const INTEL_GENERATION: Record<number, number> = { 1: 25, 2: 30, 3: 33, 4: 37, 5: 39, 6: 45, 7: 48, 8: 60, 9: 65, 10: 70, 11: 80, 12: 100, 13: 112, 14: 118 }
const INTEL_TIER: Record<string, number> = { '3': 0.6, '5': 0.78, '7': 0.9, '9': 1 }
const RYZEN_SERIES: Record<number, number> = { 1: 55, 2: 62, 3: 80, 4: 85, 5: 100, 6: 105, 7: 120, 8: 115, 9: 130 }
const RYZEN_TIER: Record<string, number> = { '3': 0.62, '5': 0.8, '7': 0.92, '9': 1 }

/** Every processor named in a text, with its score. */
export function cpuScores(text: string): number[] {
  const value = text.toLowerCase().replace(/\(r\)|\(tm\)|®|™/g, ' ')
  const scores: number[] = []

  for (const match of value.matchAll(/\bi([3579])[\s-]?(\d{4,5})([a-z]{0,2})\b/g)) {
    const digits = match[2]!
    const generation = digits.length === 5 ? Number(digits.slice(0, 2)) : Number(digits[0])
    const base = INTEL_GENERATION[generation]
    if (base === undefined) continue
    const mobile = /^(u|y)$/.test(match[3] ?? '') ? 0.75 : /^h/.test(match[3] ?? '') ? 0.9 : 1
    scores.push(base * INTEL_TIER[match[1]!]! * mobile)
  }
  for (const match of value.matchAll(/\bcore\s+ultra\s+([579])\s+(\d)\d{2}([a-z]?)\b/g)) {
    const base = match[2] === '1' ? 100 : 118
    scores.push(base * ({ '5': 0.85, '7': 0.95, '9': 1 } as Record<string, number>)[match[1]!]!)
  }
  for (const match of value.matchAll(/\bryzen\s+([3579])\s+(?:pro\s+)?(\d)(\d{3})([a-z0-9]{0,3})\b/g)) {
    const base = RYZEN_SERIES[Number(match[2])]
    if (base === undefined) continue
    const mobile = /^u/.test(match[4] ?? '') ? 0.75 : /^(h|hs|hx)/.test(match[4] ?? '') ? 0.9 : 1
    scores.push(base * RYZEN_TIER[match[1]!]! * mobile)
  }
  for (const match of value.matchAll(/\bfx[\s-]?(\d)\d{3}\b/g)) scores.push(({ 4: 22, 6: 28, 8: 33, 9: 35 } as Record<number, number>)[Number(match[1])] ?? 25)
  if (/\bphenom\s+ii\s+x6\b/.test(value)) scores.push(25)
  else if (/\bphenom\s+ii\b/.test(value)) scores.push(20)
  if (/\bcore\s*2\s*quad\b|\bq[69]\d{3}\b/.test(value)) scores.push(15)
  else if (/\bcore\s*2\s*duo\b|\be[678]\d{3}\b/.test(value)) scores.push(10)
  if (/\bathlon\b/.test(value)) scores.push(16)
  if (/\b(pentium|celeron)\b/.test(value)) scores.push(16)
  if (/\ba(8|10|12)[\s-]\d{4}\b/.test(value)) scores.push(18)
  return scores
}

// ---------------------------------------------------------------- memory

/** "8 GB RAM", "16GB", "4096 MB" in GB. */
export function memoryGigabytes(text: string): number | null {
  const match = /(\d+(?:[.,]\d+)?)\s*(gb|mb|go)\b/i.exec(text)
  if (!match) return null
  const amount = Number(match[1]!.replace(',', '.'))
  return /mb/i.test(match[2]!) ? amount / 1024 : amount
}

// ---------------------------------------------------------------- verdict

function find(items: RequirementItem[] | null, label: RegExp): string | null {
  return items?.find((item) => label.test(item.label))?.value ?? null
}

/** The lowest of the alternatives a store lists ("GTX 1060 or RX 580"): meeting either is enough. */
function requirementScore(text: string | null, scorer: (text: string) => number[]): number | null {
  if (!text) return null
  const scores = scorer(text)
  return scores.length > 0 ? Math.min(...scores) : null
}

/**
 * good: meets or comes close to the recommended specs (within 20%). ok: meets the minimum.
 * bad: below the minimum. With only a minimum listed, well above it (1.3×) counts as good.
 */
export function judge(yours: number | null, minimum: number | null, recommended: number | null): Verdict {
  if (yours === null || (minimum === null && recommended === null)) return 'unknown'
  if (recommended !== null && yours >= recommended * 0.8) return 'good'
  if (minimum !== null) {
    if (recommended === null && yours >= minimum * 1.3) return 'good'
    return yours >= minimum * 0.95 ? 'ok' : 'bad'
  }
  return yours >= recommended! * 0.6 ? 'ok' : 'bad'
}

const RANK: Record<Verdict, number> = { bad: 0, ok: 1, good: 2, unknown: 3 }

export function checkCompatibility(requirements: GameRequirements | null | undefined, hardware: HardwareInfo | null): CompatibilityResult {
  if (!requirements || !hardware) return { overall: 'unknown', parts: [] }
  const minimum = requirements.minimum
  const recommended = requirements.recommended

  const gpuText = hardware.gpus.map((gpu) => gpu.name).join(' / ')
  const myGpu = hardware.gpus.length > 0 ? Math.max(0, ...hardware.gpus.flatMap((gpu) => gpuScores(gpu.name))) || null : null
  const myCpu = hardware.cpu ? (cpuScores(hardware.cpu.name)[0] ?? null) : null
  const myRam = hardware.memory.totalBytes > 0 ? hardware.memory.totalBytes / 1024 ** 3 : null

  const gpuLabel = /graphics|video|gpu|tarjeta/i
  const cpuLabel = /processor|cpu|procesador/i
  const ramLabel = /memory|ram|memoria/i

  const ramValue = (items: RequirementItem[] | null) => {
    const text = find(items, ramLabel)
    return text ? memoryGigabytes(text) : null
  }

  const parts: PartCheck[] = [
    {
      part: 'gpu',
      label: 'Graphics',
      yours: gpuText || null,
      verdict: judge(myGpu, requirementScore(find(minimum, gpuLabel), gpuScores), requirementScore(find(recommended, gpuLabel), gpuScores))
    },
    {
      part: 'cpu',
      label: 'Processor',
      yours: hardware.cpu?.name ?? null,
      verdict: judge(myCpu, requirementScore(find(minimum, cpuLabel), cpuScores), requirementScore(find(recommended, cpuLabel), cpuScores))
    },
    {
      part: 'ram',
      label: 'Memory',
      yours: myRam !== null ? `${Math.round(myRam)} GB` : null,
      // Windows reports a little under the installed amount (15.9 GB for 16), so allow for it.
      verdict: judge(myRam !== null ? myRam + 0.5 : null, ramValue(minimum), ramValue(recommended))
    }
  ]

  const known = parts.filter((part) => part.verdict !== 'unknown')
  const overall = known.length === 0 ? 'unknown' : known.reduce<Verdict>((worst, part) => (RANK[part.verdict] < RANK[worst] ? part.verdict : worst), 'good')
  return { overall, parts }
}
