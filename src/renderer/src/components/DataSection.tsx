import { useState } from 'react'
import type { ExportSummary, ImportSummary } from '@shared/types'
import { formatBytes } from '../format'
import { startOver } from '../resetApp'
import { errorMessage, useLauncher } from '../store'

type Result = { kind: 'export'; summary: ExportSummary } | { kind: 'import'; summary: ImportSummary }

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** Settings module: save everything to one file, or merge such a file into this library. */
export function DataSection() {
  const { refresh, setError, setProfile } = useLauncher()
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  async function exportData() {
    setBusy('export')
    try {
      const summary = await window.api.data.export()
      if (summary) setResult({ kind: 'export', summary })
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function importData() {
    setBusy('import')
    try {
      const summary = await window.api.data.import()
      if (summary) {
        setResult({ kind: 'import', summary })
        setProfile(await window.api.profile.get())
        await refresh()
      }
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const card = 'flex items-center justify-between gap-6 rounded-lg bg-surface px-5 py-4'
  const action = 'shrink-0 rounded-md bg-raised px-5 py-2 text-sm font-semibold hover:bg-line disabled:opacity-50'

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-2xl font-semibold">Backup and restore</h2>
        <p className="mt-1 text-sm text-muted">Keep your library when you change PC or reinstall Windows. Everything goes into one .orus file.</p>
      </div>

      <div className={card}>
        <div className="min-w-0">
          <h3 className="font-semibold">Export your data</h3>
          <p className="text-sm text-muted">Games, hours and sessions, covers, banners, descriptions, favorites and your profile.</p>
        </div>
        <button type="button" disabled={busy !== null} onClick={() => void exportData()} className={action}>
          {busy === 'export' ? 'Exporting' : 'Export…'}
        </button>
      </div>

      <div className={card}>
        <div className="min-w-0">
          <h3 className="font-semibold">Import data</h3>
          <p className="text-sm text-muted">Adds what the file has. Nothing you already have is deleted or replaced.</p>
        </div>
        <button type="button" disabled={busy !== null} onClick={() => void importData()} className={action}>
          {busy === 'import' ? 'Importing' : 'Import…'}
        </button>
      </div>

      <div className={`${card} mt-3`}>
        <div className="min-w-0">
          <h3 className="font-semibold">Delete profile and start over</h3>
          <p className="text-sm text-muted">Saves and checks a full backup first, then clears Orus and opens the welcome screen again.</p>
        </div>
        <button type="button" disabled={busy !== null} onClick={() => void startOver()} className={`${action} hover:!bg-danger hover:!text-white`}>
          Start over…
        </button>
      </div>

      {result?.kind === 'export' && (
        <p role="status" className="rounded-md bg-accent/15 px-4 py-3 text-sm">
          Saved {plural(result.summary.games, 'game', 'games')}, {plural(result.summary.sessions, 'play session', 'play sessions')} and {plural(result.summary.images, 'image', 'images')} ({formatBytes(result.summary.sizeBytes)}) to{' '}
          <span className="break-all text-muted">{result.summary.filePath}</span>
        </p>
      )}
      {result?.kind === 'import' && (
        <div role="status" className="flex flex-col gap-1 rounded-md bg-accent/15 px-4 py-3 text-sm">
          <span>
            Added {plural(result.summary.gamesAdded, 'game', 'games')}, updated {result.summary.gamesMerged}, and brought in {plural(result.summary.sessionsAdded, 'play session', 'play sessions')}
            {result.summary.profileRestored ? ', plus your profile' : ''}.
          </span>
          <span className="text-muted">Orus is checking this PC now. Games whose folder is somewhere else show as not installed; open one and use Change location to point to it.</span>
        </div>
      )}
    </section>
  )
}
