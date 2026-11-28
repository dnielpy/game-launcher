import { app, net } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { UpdateStatus } from '@shared/types'
import { log } from '../logger'
import { canResume, compareVersions, parseContentRange, parsePartial, parseRelease, partialFor, SpeedMeter, type ReleaseInfo } from './releases'

/** Where releases are published. The installer of the latest release is what gets downloaded. */
export const UPDATE_REPOSITORY = 'dnielpy/game-launcher'

const CHECK_DELAY_MS = 15_000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const PROGRESS_INTERVAL_MS = 250
/** After a dropped connection the download picks up again on its own, waiting a little longer each time. */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000]
const PARTIAL_FILE = 'download.json'

/**
 * Checks GitHub for a newer release, downloads its installer with live progress,
 * verifies it and runs it silently. The installer replaces the app and starts it again.
 *
 * The download can be paused and resumed, and a dropped connection continues from where it
 * stopped (HTTP Range) instead of starting over, also after Orus is closed and opened again.
 * A partial download is only kept while it is still the latest release: when a newer
 * version comes out it is thrown away and the new one is downloaded instead.
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
  /** Why the running download was stopped by the user: pausing keeps the partial file, cancelling deletes it. */
  private stopReason: 'pause' | 'cancel' | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly onStatus: (status: UpdateStatus) => void) {}

  getStatus(): UpdateStatus {
    return this.status
  }

  /** Checks shortly after start and then every few hours. Only packaged builds update themselves. */
  startSchedule(): void {
    if (!app.isPackaged) return
    // Earlier versions downloaded into temp; that copy is never resumed.
    rmSync(path.join(app.getPath('temp'), 'orus-update'), { recursive: true, force: true })
    setTimeout(() => void this.check(), CHECK_DELAY_MS)
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    // Closing Orus pauses the download; it can be resumed on the next start.
    this.stopReason = 'pause'
    this.abort?.abort()
  }

  async check(): Promise<UpdateStatus> {
    if (['checking', 'downloading', 'installing'].includes(this.status.state)) return this.status
    // A downloaded installer stays ready; checking again would only throw it away.
    if (this.status.state === 'downloaded') return this.status
    const previous = this.status.state
    this.set({ state: 'checking', error: null })

    try {
      const release = await this.fetchLatest()
      const checkedAt = new Date().toISOString()
      if (!release || compareVersions(release.version, app.getVersion()) <= 0) {
        this.release = null
        this.discardPartial()
        this.set({ state: 'up-to-date', latest: null, download: null, checkedAt })
        return this.status
      }
      if (!release.asset) throw new Error(`Version ${release.version} has no Windows installer attached yet.`)

      this.release = release
      const latest = { version: release.version, notes: release.notes, publishedAt: release.publishedAt, sizeBytes: release.asset.size }
      const received = this.resumableBytes()
      if (received > 0) {
        this.set({ state: 'paused', checkedAt, latest, download: { receivedBytes: received, totalBytes: release.asset.size, bytesPerSecond: 0 } })
      } else {
        this.discardPartial()
        this.set({ state: 'available', checkedAt, latest, download: null })
      }
    } catch (error) {
      log.warn('Update check failed', error)
      // A paused download stays paused; only the check itself failed.
      if (previous === 'paused' && this.resumableBytes() > 0) this.set({ state: 'paused', error: errorText(error) })
      else this.set({ state: 'error', error: errorText(error) })
    }
    return this.status
  }

  /**
   * Starts the download, or resumes a paused or interrupted one. Before resuming it looks
   * for a newer release once more, so a partial download of an outdated version is not finished.
   */
  async download(): Promise<void> {
    if (!this.release?.asset || this.status.state === 'downloading') return
    if (!['available', 'paused', 'error'].includes(this.status.state)) return

    if (this.resumableBytes() > 0) {
      try {
        const latest = await this.fetchLatest()
        if (latest?.asset && compareVersions(latest.version, this.release.version) > 0) {
          this.release = latest
          this.discardPartial()
          this.set({ latest: { version: latest.version, notes: latest.notes, publishedAt: latest.publishedAt, sizeBytes: latest.asset.size } })
        }
      } catch (error) {
        // Offline or rate limited: carry on with the release we know about.
        log.warn('Could not look for a newer release before resuming', error)
      }
    }

    const release = this.release
    const asset = release.asset!
    this.stopReason = null
    this.set({ state: 'downloading', error: null, download: { receivedBytes: this.resumableBytes(), totalBytes: asset.size, bytesPerSecond: 0 } })

    for (let attempt = 0; ; attempt++) {
      this.abort = new AbortController()
      try {
        await this.transfer(release)
        return
      } catch (error) {
        const reason = this.stopReason
        if (reason === 'cancel') {
          this.discardPartial()
          this.set({ state: 'available', download: null, error: null })
          return
        }
        const received = this.resumableBytes()
        if (reason === 'pause') {
          this.set({ state: 'paused', download: { receivedBytes: received, totalBytes: asset.size, bytesPerSecond: 0 } })
          return
        }
        if (error instanceof IntegrityError) {
          log.warn('Update download rejected', error)
          this.discardPartial()
          this.set({ state: 'error', download: null, error: error.message })
          return
        }
        log.warn(`Update download interrupted (attempt ${attempt + 1})`, error)
        const delay = RETRY_DELAYS_MS[attempt]
        if (delay === undefined || !(await this.wait(delay))) {
          if (this.stopReason === 'cancel') {
            this.discardPartial()
            this.set({ state: 'available', download: null, error: null })
            return
          }
          const message = this.stopReason === 'pause' ? null : `The download stopped: ${errorText(error)}. Resume to continue from where it left off.`
          this.set({ state: 'paused', error: message, download: { receivedBytes: received, totalBytes: asset.size, bytesPerSecond: 0 } })
          return
        }
        this.set({ download: { receivedBytes: received, totalBytes: asset.size, bytesPerSecond: 0 } })
      } finally {
        this.abort = null
      }
    }
  }

  /** Stops the download and keeps what was received, so it can be resumed later. */
  pause(): void {
    if (this.status.state !== 'downloading') return
    this.stopReason = 'pause'
    this.abort?.abort()
  }

  /** Stops the download and deletes what was received. */
  cancel(): void {
    if (this.status.state === 'downloading') {
      this.stopReason = 'cancel'
      this.abort?.abort()
      return
    }
    if (this.status.state === 'paused' || this.status.state === 'error') {
      this.discardPartial()
      this.set(this.release ? { state: 'available', download: null, error: null } : { state: 'idle', download: null, error: null })
    }
  }

  private async fetchLatest(): Promise<ReleaseInfo | null> {
    const response = await net.fetch(`https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Orus/${app.getVersion()}` }
    })
    if (response.status === 404) {
      throw new Error('No published releases were found. The update repository must be public and have at least one release.')
    }
    if (response.status === 403 || response.status === 429) throw new Error('GitHub is limiting requests right now. Try again in a while.')
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
    return parseRelease(await response.json())
  }

  /** One attempt: asks for the bytes still missing and appends them to the partial file. */
  private async transfer(release: ReleaseInfo): Promise<void> {
    const asset = release.asset!
    const target = this.targetPath(asset.name)
    mkdirSync(this.directory(), { recursive: true })
    let offset = this.resumableBytes()
    if (offset === 0) {
      rmSync(this.directory(), { recursive: true, force: true })
      mkdirSync(this.directory(), { recursive: true })
      writeFileSync(this.partialPath(), JSON.stringify(partialFor(release)))
    }

    if (asset.size > 0 && offset >= asset.size) {
      await this.finish(release, target)
      return
    }

    const headers: Record<string, string> = { 'User-Agent': `Orus/${app.getVersion()}` }
    if (offset > 0) headers['Range'] = `bytes=${offset}-`
    const response = await net.fetch(asset.url, { signal: this.abort!.signal, headers })

    if (response.status === 416 && offset > 0) {
      // The server says there is nothing left to send: the file may already be whole.
      await response.body?.cancel()
      await this.finish(release, target)
      return
    }
    if (!response.ok || !response.body) throw new Error(`the server answered ${response.status}`)

    let append = false
    if (offset > 0 && response.status === 206) {
      const range = parseContentRange(response.headers.get('content-range'))
      if (range && range.start === offset) append = true
    }
    if (!append) offset = 0
    const total = asset.size || (append ? 0 : Number(response.headers.get('content-length')) || 0)

    const file = createWriteStream(target, { flags: append ? 'a' : 'w' })
    const closed = new Promise<void>((resolve, reject) => {
      file.once('close', resolve)
      file.once('error', reject)
    })
    closed.catch(() => undefined)
    const meter = new SpeedMeter()
    const reader = response.body.getReader()
    let received = offset
    let lastReport = 0
    meter.add(received)

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!file.write(value)) await new Promise<void>((resolve) => file.once('drain', resolve))
        received += value.byteLength
        const now = Date.now()
        meter.add(received, now)
        if (now - lastReport >= PROGRESS_INTERVAL_MS) {
          lastReport = now
          this.set({ download: { receivedBytes: received, totalBytes: total, bytesPerSecond: meter.bytesPerSecond() } })
        }
      }
    } finally {
      file.end()
      await closed
    }

    await this.finish(release, target)
  }

  /** Checks the whole file against the release and marks it ready to install. */
  private async finish(release: ReleaseInfo, target: string): Promise<void> {
    const asset = release.asset!
    const size = existsSync(target) ? statSync(target).size : 0
    if (asset.size > 0 && size < asset.size) throw new Error('the connection closed before the installer was complete')
    if (asset.size > 0 && size > asset.size) throw new IntegrityError('The download was larger than the published installer. It was deleted for safety.')
    if (asset.digest?.startsWith('sha256:') && asset.digest.slice(7).toLowerCase() !== (await sha256(target))) {
      throw new IntegrityError('The downloaded installer does not match the published one. It was deleted for safety.')
    }
    this.installerPath = target
    this.set({ state: 'downloaded', download: { receivedBytes: size, totalBytes: asset.size || size, bytesPerSecond: 0 } })
  }

  /** Waits before another attempt. False when the user paused or cancelled meanwhile. */
  private wait(ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      const abort = new AbortController()
      this.abort = abort
      const timer = setTimeout(() => resolve(true), ms)
      abort.signal.addEventListener('abort', () => {
        clearTimeout(timer)
        resolve(false)
      })
    })
  }

  /** Bytes already on disk for the release on offer. Zero when there is nothing to continue. */
  private resumableBytes(): number {
    const asset = this.release?.asset
    if (!asset) return 0
    let partial = null
    try {
      partial = parsePartial(JSON.parse(readFileSync(this.partialPath(), 'utf8')))
    } catch {
      return 0
    }
    if (!canResume(partial, this.release)) return 0
    const target = this.targetPath(asset.name)
    return existsSync(target) ? statSync(target).size : 0
  }

  private discardPartial(): void {
    this.installerPath = null
    rmSync(this.directory(), { recursive: true, force: true })
  }

  /** Kept in the app's data folder, not in temp, so a paused download survives a restart. */
  private directory(): string {
    return path.join(app.getPath('userData'), 'update-download')
  }

  private partialPath(): string {
    return path.join(this.directory(), PARTIAL_FILE)
  }

  private targetPath(name: string): string {
    return path.join(this.directory(), path.basename(name))
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

/** A download that arrived whole but is not the published installer. It is not resumed. */
class IntegrityError extends Error {}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}
