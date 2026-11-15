import { shortenPath } from '../format'
import { useLauncher } from '../store'

const PHASE_LABELS = {
  preparing: 'Getting ready',
  sources: 'Reading installed programs and shortcuts',
  folders: 'Looking through your folders',
  executables: 'Checking programs outside your folders',
  saving: 'Saving your library',
  icons: 'Saving your library',
  done: 'Finishing'
} as const

function ProgressBar({ fraction }: { fraction: number | null }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}>
      {fraction === null ? (
        <div className="h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-accent-bright" />
      ) : (
        <div className="h-full rounded-full bg-accent-bright transition-[width] duration-300 ease-out" style={{ width: `${Math.max(2, fraction * 100)}%` }} />
      )}
    </div>
  )
}

/** Full-screen card shown while the library is built: first the folder scan, then covers and details. */
export function ScanOverlay() {
  const { overlayVisible, scanning, progress, metadataProgress, hideOverlay, cancelScan } = useLauncher()
  const fetchingMetadata = !scanning && metadataProgress?.running === true
  if (!overlayVisible || (!scanning && !fetchingMetadata)) return null

  const title = fetchingMetadata ? 'Getting covers and game details' : 'Looking for your games'
  const fraction = fetchingMetadata
    ? metadataProgress!.total > 0
      ? metadataProgress!.done / metadataProgress!.total
      : null
    : (progress?.fraction ?? null)
  const status = fetchingMetadata
    ? `${metadataProgress!.done} of ${metadataProgress!.total} games`
    : progress
      ? PHASE_LABELS[progress.phase]
      : 'Getting ready'
  const detail = fetchingMetadata ? metadataProgress!.currentTitle : (progress?.currentPath ?? null)

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-canvas/85 backdrop-blur-md">
      <div className="w-[560px] max-w-[90vw] rounded-xl border border-line bg-surface px-10 py-9 shadow-2xl">
        <h2 className="font-display text-3xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted">
          {fetchingMetadata
            ? 'Downloading box art, banners, descriptions and ratings. You can start playing while this finishes.'
            : 'Checking every drive for installed games. This only takes long the first time.'}
        </p>

        <div className="mt-8 flex items-baseline justify-between text-sm">
          <span className="text-ink">{status}</span>
          {fraction !== null && <span className="tabular-nums text-muted">{Math.round(fraction * 100)}%</span>}
        </div>
        <div className="mt-2">
          <ProgressBar fraction={fraction} />
        </div>
        <p className="mt-3 h-5 truncate text-xs text-muted" title={detail ?? undefined}>
          {detail ? (fetchingMetadata ? detail : shortenPath(detail, 80)) : ''}
        </p>

        {!fetchingMetadata && progress && (
          <div className="mt-6 grid grid-cols-2 gap-4 rounded-lg bg-canvas px-5 py-4">
            <div>
              <div className="font-display text-2xl font-semibold tabular-nums">{progress.gamesFound}</div>
              <div className="text-xs text-muted">games found</div>
            </div>
            <div>
              <div className="font-display text-2xl font-semibold tabular-nums">{progress.foldersVisited}</div>
              <div className="text-xs text-muted">folders checked</div>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-end gap-3">
          {scanning && (
            <button type="button" onClick={() => void cancelScan()} className="rounded-md px-4 py-2 text-sm text-muted hover:bg-raised hover:text-ink">
              Stop scan
            </button>
          )}
          <button type="button" onClick={hideOverlay} className="rounded-md bg-raised px-4 py-2 text-sm hover:bg-line">
            Continue in the background
          </button>
        </div>
      </div>
      <style>{'@keyframes indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
    </div>
  )
}
