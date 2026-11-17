import { formatRelative } from '../format'
import { useLauncher } from '../store'

/** Settings: run a scan by hand and see what the last one found. */
export function ScanCard() {
  const { scanning, progress, metadataProgress, lastSummary, startScan, roots, online } = useLauncher()
  const fetching = metadataProgress?.running === true
  const lastScanned = roots.map((root) => root.lastScannedAt).filter((value): value is string => value !== null).sort().pop() ?? null

  let status: string
  if (scanning) status = progress?.message || 'Scanning for games'
  else if (fetching) status = `Getting covers, ${metadataProgress!.done} of ${metadataProgress!.total}`
  else if (lastSummary) status = `Last scan found ${lastSummary.added} new ${lastSummary.added === 1 ? 'game' : 'games'}`
  else status = lastScanned ? `Last scan ${formatRelative(lastScanned).toLowerCase()}` : 'Not scanned yet'

  return (
    <div className="flex items-center gap-4 rounded-lg bg-surface px-5 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent-bright">
        <svg viewBox="0 0 24 24" className={`h-5 w-5 ${scanning || fetching ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Your games</div>
        <div className="truncate text-sm text-muted">
          {status}
          {!online && !scanning ? '. You are offline: covers arrive once you are connected and scan again.' : ''}
        </div>
      </div>
      <button
        type="button"
        disabled={scanning}
        onClick={() => void startScan(true)}
        className="shrink-0 rounded-md bg-accent px-5 py-2 text-sm font-semibold text-white enabled:hover:bg-accent-bright enabled:hover:text-black disabled:opacity-50"
      >
        {scanning ? 'Scanning' : 'Scan again'}
      </button>
    </div>
  )
}
