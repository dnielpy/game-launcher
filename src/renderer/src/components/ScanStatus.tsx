import { useLauncher } from '../store'

const PHASE_LABELS = {
  preparing: 'Getting ready',
  sources: 'Reading installed programs',
  folders: 'Looking through folders',
  executables: 'Checking more locations',
  saving: 'Saving your library',
  icons: 'Loading icons',
  done: 'Finishing'
} as const

export function ScanStatus() {
  const { scanning, progress, lastSummary, startScan, cancelScan } = useLauncher()

  if (scanning) {
    return (
      <div className="flex items-center gap-4">
        <div className="min-w-0 text-right">
          <div className="text-sm text-ink">
            {progress ? PHASE_LABELS[progress.phase] : 'Starting scan'}
            {progress && progress.gamesFound > 0 ? `, ${progress.gamesFound} games found so far` : ''}
          </div>
          <div className="max-w-md truncate text-xs text-muted" title={progress?.message}>
            {progress?.message ?? ''}
          </div>
        </div>
        <div className="h-1 w-32 overflow-hidden rounded-full bg-raised">
          <div className="h-full w-1/3 animate-[scan_1.2s_ease-in-out_infinite] rounded-full bg-accent-bright" />
        </div>
        <button type="button" onClick={() => void cancelScan()} className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-raised hover:text-ink">
          Stop
        </button>
        <style>{'@keyframes scan{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4">
      {lastSummary && (
        <span className="text-xs text-muted">
          Last scan: {lastSummary.added} new, {lastSummary.missing} missing, {Math.round(lastSummary.durationMs / 1000)}s
        </span>
      )}
      <button type="button" onClick={() => void startScan()} className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-bright hover:text-black">
        Scan for games
      </button>
    </div>
  )
}
