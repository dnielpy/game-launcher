import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

let logFile: string | null = null

export function initLogger(directory: string): void {
  mkdirSync(directory, { recursive: true })
  logFile = path.join(directory, 'main.log')
}

function write(level: 'info' | 'warn' | 'error', message: string, detail?: unknown): void {
  const suffix = detail === undefined ? '' : ` ${detail instanceof Error ? detail.stack ?? detail.message : JSON.stringify(detail)}`
  const line = `${new Date().toISOString()} [${level}] ${message}${suffix}`
  if (level === 'error') console.error(line)
  else console.log(line)
  if (logFile) {
    try {
      appendFileSync(logFile, line + '\n')
    } catch {
      // Logging must never crash the app.
    }
  }
}

export const log = {
  info: (message: string, detail?: unknown) => write('info', message, detail),
  warn: (message: string, detail?: unknown) => write('warn', message, detail),
  error: (message: string, detail?: unknown) => write('error', message, detail)
}
