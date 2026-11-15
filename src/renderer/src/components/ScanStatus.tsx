import { useLauncher } from '../store'

/** Small status in the header: background scans and cover downloads. */
export function ScanStatus() {
  const { scanning, progress, metadataProgress, lastSummary, startScan, overlayVisible } = useLauncher()
  const fetching = metadataProgress?.running === true

  if ((scanning || fetching) && !overlayVisible) {
    const fraction = scanning ? (progress?.fraction ?? 0) : metadataProgress!.total > 0 ? metadataProgress!.done / metadataProgress!.total : 0
    return (
      <button
        type="button"
        onClick={() => useLauncher.setState({ overlayVisible: true })}
        className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm text-muted hover:bg-raised hover:text-ink"
      >
        <span>{scanning ? 'Scanning for games' : `Getting covers, ${metadataProgress!.done} of ${metadataProgress!.total}`}</span>
        <span className="h-1 w-24 overflow-hidden rounded-full bg-raised">
          <span className="block h-full rounded-full bg-accent-bright transition-[width]" style={{ width: `${Math.max(4, fraction * 100)}%` }} />
        </span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-4">
      {lastSummary && !scanning && (
        <span className="text-xs text-muted">
          Last scan found {lastSummary.added} new {lastSummary.added === 1 ? 'game' : 'games'}
        </span>
      )}
      <button
        type="button"
        disabled={scanning}
        onClick={() => void startScan(true)}
        className="rounded-md bg-raised px-4 py-2 text-sm font-semibold text-ink hover:bg-line disabled:opacity-50"
      >
        Scan again
      </button>
    </div>
  )
}
