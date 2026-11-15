/** Value in Valve's KeyValues text format: either a string or a nested object. */
export type VdfValue = string | VdfObject
export interface VdfObject {
  [key: string]: VdfValue
}

type Token = { type: 'string'; value: string } | { type: 'open' } | { type: 'close' }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const char = input[i]!
    if (/\s/.test(char)) {
      i++
    } else if (char === '/' && input[i + 1] === '/') {
      while (i < input.length && input[i] !== '\n') i++
    } else if (char === '{') {
      tokens.push({ type: 'open' })
      i++
    } else if (char === '}') {
      tokens.push({ type: 'close' })
      i++
    } else if (char === '"') {
      let value = ''
      i++
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < input.length) {
          const next = input[i + 1]!
          value += next === 'n' ? '\n' : next === 't' ? '\t' : next
          i += 2
        } else {
          value += input[i]
          i++
        }
      }
      i++
      tokens.push({ type: 'string', value })
    } else {
      let value = ''
      while (i < input.length && !/[\s{}"]/.test(input[i]!)) {
        value += input[i]
        i++
      }
      tokens.push({ type: 'string', value })
    }
  }
  return tokens
}

/** Parses Valve KeyValues text (libraryfolders.vdf, appmanifest_*.acf). Keys are lower-cased. */
export function parseVdf(input: string): VdfObject {
  const tokens = tokenize(input)
  let position = 0

  function parseObject(): VdfObject {
    const result: VdfObject = {}
    while (position < tokens.length) {
      const token = tokens[position]!
      if (token.type === 'close') {
        position++
        return result
      }
      if (token.type !== 'string') {
        position++
        continue
      }
      const key = token.value.toLowerCase()
      position++
      const next = tokens[position]
      if (!next) break
      if (next.type === 'open') {
        position++
        result[key] = parseObject()
      } else if (next.type === 'string') {
        result[key] = next.value
        position++
      } else {
        position++
      }
    }
    return result
  }

  return parseObject()
}

export function vdfObject(value: VdfValue | undefined): VdfObject | null {
  return value !== undefined && typeof value === 'object' ? value : null
}

export function vdfString(value: VdfValue | undefined): string | null {
  return typeof value === 'string' ? value : null
}
