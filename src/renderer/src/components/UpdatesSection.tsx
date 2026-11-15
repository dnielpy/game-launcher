import type { UpdateStatus } from '@shared/types'
import { formatBytes, formatDate } from '../format'
import { errorMessage, useLauncher } from '../store'

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return 'Starting'
  return `${formatBytes(bytesPerSecond)}/s`
}

function timeLeft(download: NonNullable<UpdateStatus['download']>): string | null {
  if (download.bytesPerSecond <= 0 || download.totalBytes <= 0) return null
  const seconds = Math.max(0, (download.totalBytes - download.receivedBytes) / download.bytesPerSecond)
  if (seconds < 60) return `${Math.ceil(seconds)} s left`
  return `${Math.ceil(seconds / 60)} min left`
}

/** Settings section: current version, update check, download with live progress and install. */
export function UpdatesSection() {
  const { update, setError } = useLauncher()

  async function run(task: () => Promise<unknown>) {
    try {
      await task()
    } catch (error) {
      setError(errorMessage(error))
    }
  }

  const status = update
  const primary = 'rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-bright hover:text-black disabled:opacity-40'
  const secondary = 'rounded-md bg-raised px-4 py-2 text-sm hover:bg-line disabled:opacity-40'

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Updates</h2>
          <p className="mt-1 text-sm text-muted">
            You have Orus {status?.currentVersion ?? ''}.{' '}
            {status?.checkedAt && status.state === 'up-to-date' ? `It is the latest version (checked ${formatDate(status.checkedAt).toLowerCase()}).` : ''}
          </p>
        </div>
        {(!status || ['idle', 'up-to-date', 'error', 'checking'].includes(status.state)) && (
          <button type="button" disabled={status?.state === 'checking'} onClick={() => void run(() => window.api.updates.check())} className={secondary}>
            {status?.state === 'checking' ? 'Checking' : 'Check for updates'}
          </button>
        )}
      </div>

      {status?.state === 'error' && status.error && <p className="rounded-md bg-danger/10 px-4 py-3 text-sm">{status.error}</p>}

      {status?.latest && ['available', 'downloading', 'downloaded', 'installing'].includes(status.state) && (
        <div className="flex flex-col gap-4 rounded-md bg-canvas px-5 py-4">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <div className="font-semibold">Orus {status.latest.version} is available</div>
              <div className="text-xs text-muted">
                {formatBytes(status.latest.sizeBytes)}
                {status.latest.publishedAt ? `, released ${formatDate(status.latest.publishedAt).toLowerCase()}` : ''}
              </div>
            </div>
            {status.state === 'available' && (
              <button type="button" onClick={() => void run(() => window.api.updates.download())} className={primary}>
                Download and install
              </button>
            )}
            {status.state === 'downloaded' && (
              <button type="button" onClick={() => void run(() => window.api.updates.install())} className={primary}>
                Restart and install
              </button>
            )}
          </div>

          {status.state === 'downloading' && status.download && (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="tabular-nums">
                  {formatBytes(status.download.receivedBytes)} of {formatBytes(status.download.totalBytes)}
                </span>
                <span className="tabular-nums text-accent-bright">{formatSpeed(status.download.bytesPerSecond)}</span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-raised"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((status.download.receivedBytes / Math.max(1, status.download.totalBytes)) * 100)}
              >
                <div
                  className="h-full rounded-full bg-accent-bright transition-[width] duration-200"
                  style={{ width: `${Math.min(100, (status.download.receivedBytes / Math.max(1, status.download.totalBytes)) * 100)}%` }}
                />
              </div>
              <div className="flex items-baseline justify-between text-xs text-muted">
                <span className="tabular-nums">
                  {Math.floor((status.download.receivedBytes / Math.max(1, status.download.totalBytes)) * 100)}%{timeLeft(status.download) ? `, ${timeLeft(status.download)}` : ''}
                </span>
                <button type="button" onClick={() => void run(() => window.api.updates.cancel())} className="hover:text-ink">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {status.state === 'downloaded' && <p className="text-sm text-muted">Downloaded and verified. Orus will close, install the update and open again.</p>}
          {status.state === 'installing' && <p className="text-sm text-muted">Installing. Orus will open again in a moment.</p>}

          {status.latest.notes && (
            <details className="text-sm text-muted">
              <summary className="cursor-pointer text-ink">What’s new</summary>
              <p className="mt-2 whitespace-pre-line">{status.latest.notes}</p>
            </details>
          )}
        </div>
      )}
    </section>
  )
}
