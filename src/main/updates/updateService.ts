import { app, net } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, mkdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import type { UpdateStatus } from '@shared/types'
import { log } from '../logger'
import { compareVersions, parseRelease, SpeedMeter, type ReleaseInfo } from './releases'

/** Where releases are published. The installer of the latest release is what gets downloaded. */
export const UPDATE_REPOSITORY = 'dnielpy/game-launcher'

const CHECK_DELAY_MS = 15_000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const PROGRESS_INTERVAL_MS = 250

/**
 * Checks GitHub for a newer release, downloads its installer with live progress,
 * verifies it and runs it silently. The installer replaces the app and starts it again.
 */
export class UpdateService {
  private status: UpdateStatus = {
    state: 'idle',
    currentVersion: app.getVersion(),
    latest: null,
    download: null,
    error: null,
    checkedAt: null
  }
  private release: ReleaseInfo | null = null
  private installerPath: string | null = null
  private abort: AbortController | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly onStatus: (status: UpdateStatus) => void) {}

  getStatus(): UpdateStatus {
    return this.status
  }

  /** Checks shortly after start and then every few hours. Only packaged builds update themselves. */
  startSchedule(): void {
    if (!app.isPackaged) return
    setTimeout(() => void this.check(), CHECK_DELAY_MS)
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.abort?.abort()
  }

  async check(): Promise<UpdateStatus> {
    if (['checking', 'downloading', 'installing'].includes(this.status.state)) return this.status
    // A downloaded installer stays ready; checking again would only throw it away.
    if (this.status.state === 'downloaded') return this.status
    this.set({ state: 'checking', error: null })

    try {
      const response = await net.fetch(`https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Orus/${app.getVersion()}` }
      })
      if (response.status === 404) {
        throw new Error('No published releases were found. The update repository must be public and have at least one release.')
      }
      if (response.status === 403 || response.status === 429) throw new Error('GitHub is limiting requests right now. Try again in a while.')
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`)

      const release = parseRelease(await response.json())
      const checkedAt = new Date().toISOString()
      if (!release || compareVersions(release.version, app.getVersion()) <= 0) {
        this.release = null
        this.set({ state: 'up-to-date', latest: null, checkedAt })
        return this.status
      }
      if (!release.asset) throw new Error(`Version ${release.version} has no Windows installer attached yet.`)

      this.release = release
      this.set({
        state: 'available',
        checkedAt,
        latest: { version: release.version, notes: release.notes, publishedAt: release.publishedAt, sizeBytes: release.asset.size }
      })
    } catch (error) {
      log.warn('Update check failed', error)
      this.set({ state: 'error', error: error instanceof Error ? error.message : String(error) })
    }
    return this.status
  }

  async download(): Promise<void> {
    const asset = this.release?.asset
    if (!asset || this.status.state === 'downloading') return

    const directory = path.join(app.getPath('temp'), 'orus-update')
    rmSync(directory, { recursive: true, force: true })
    mkdirSync(directory, { recursive: true })
    const target = path.join(directory, path.basename(asset.name))
    this.abort = new AbortController()
    this.set({ state: 'downloading', error: null, download: { receivedBytes: 0, totalBytes: asset.size, bytesPerSecond: 0 } })

    try {
      const response = await net.fetch(asset.url, { signal: this.abort.signal, headers: { 'User-Agent': `Orus/${app.getVersion()}` } })
      if (!response.ok || !response.body) throw new Error(`The download failed (${response.status})`)
      const total = Number(response.headers.get('content-length')) || asset.size

      const hash = createHash('sha256')
      const file = createWriteStream(target)
      const meter = new SpeedMeter()
      const reader = response.body.getReader()
      let received = 0
      let lastReport = 0
      meter.add(0)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.byteLength
        hash.update(value)
        if (!file.write(value)) await new Promise<void>((resolve) => file.once('drain', resolve))
        const now = Date.now()
        meter.add(received, now)
        if (now - lastReport >= PROGRESS_INTERVAL_MS) {
          lastReport = now
          this.set({ download: { receivedBytes: received, totalBytes: total, bytesPerSecond: meter.bytesPerSecond() } })
        }
      }
      await new Promise<void>((resolve, reject) => file.end((error?: Error | null) => (error ? reject(error) : resolve())))

      if (total > 0 && statSync(target).size !== total) throw new Error('The download was incomplete. Try again.')
      if (asset.digest?.startsWith('sha256:') && asset.digest.slice(7).toLowerCase() !== hash.digest('hex')) {
        throw new Error('The downloaded installer does not match the published one. It was deleted for safety.')
      }

      this.installerPath = target
      this.set({ state: 'downloaded', download: { receivedBytes: received, totalBytes: total, bytesPerSecond: 0 } })
    } catch (error) {
      rmSync(target, { force: true })
      if (this.abort?.signal.aborted) {
        this.set({ state: 'available', download: null })
      } else {
        log.warn('Update download failed', error)
        this.set({ state: 'error', download: null, error: error instanceof Error ? error.message : String(error) })
      }
    } finally {
      this.abort = null
    }
  }

  cancel(): void {
    this.abort?.abort()
  }

  /** Runs the installer silently and quits. The installer starts Orus again when it finishes. */
  install(): void {
    if (!this.installerPath || this.status.state !== 'downloaded') return
    this.set({ state: 'installing' })
    const child = spawn(this.installerPath, ['/S', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: false })
    child.unref()
    setTimeout(() => app.quit(), 500)
  }

  private set(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch }
    this.onStatus(this.status)
  }
}
