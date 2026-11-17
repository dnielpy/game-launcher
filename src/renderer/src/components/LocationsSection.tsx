import { useEffect, useState } from 'react'
import type { ExcludedPath, LibraryRoot } from '@shared/types'
import { formatDate } from '../format'
import { errorMessage, useLauncher } from '../store'

function samePlaceOrInside(child: string, parent: string): boolean {
  const normalize = (value: string) => value.replace(/[\\/]+/g, '\\').replace(/\\$/, '').toLowerCase()
  const c = normalize(child)
  const p = normalize(parent)
  return c === p || c.startsWith(`${p}\\`)
}

/** Folders the scan skips: picked here, or left behind when a game was removed from the library. */
function ExcludedFolders() {
  const { games, confirm, refresh, setError } = useLauncher()
  const [excluded, setExcluded] = useState<ExcludedPath[]>([])

  const load = () => void window.api.exclusions.list().then(setExcluded)
  useEffect(load, [])

  async function add() {
    try {
      const folder = await window.api.exclusions.pick()
      if (!folder) return
      const inside = games.filter((game) => samePlaceOrInside(game.installPath, folder))
      if (inside.length > 0) {
        const names = inside.slice(0, 6).map((game) => `• ${game.title}`).join('\n')
        const more = inside.length > 6 ? `\n…and ${inside.length - 6} more` : ''
        const ok = await confirm({
          title: 'Skip this folder?',
          message: `${inside.length === 1 ? 'This game is' : `These ${inside.length} games are`} inside it and will leave your library, with their play time:\n${names}${more}`,
          confirmLabel: 'Exclude folder',
          danger: true
        })
        if (!ok) return
      }
      await window.api.exclusions.add(folder)
      load()
      await refresh()
    } catch (error) {
      setError(errorMessage(error))
    }
  }

  async function remove(entry: ExcludedPath) {
    try {
      await window.api.exclusions.remove(entry.id)
      load()
    } catch (error) {
      setError(errorMessage(error))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Excluded</h3>
          <p className="text-sm text-muted">Orus never looks inside these, even when they are part of a location above.</p>
        </div>
        <button type="button" onClick={() => void add()} className="shrink-0 rounded-md bg-raised px-4 py-2 text-sm hover:bg-line">
          Exclude a folder
        </button>
      </div>
      {excluded.length === 0 ? (
        <p className="rounded-md bg-canvas px-5 py-4 text-sm text-muted">Nothing excluded. Removing a game from your library also adds its folder here.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md bg-canvas">
          {excluded.map((entry) => (
            <li key={entry.id} className="flex items-center gap-4 px-5 py-3.5">
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M5.6 5.6l12.8 12.8" />
              </svg>
              <div className="min-w-0 flex-1">
                <div className="truncate" title={entry.path}>
                  {entry.path}
                </div>
                <div className="text-xs text-muted">{entry.label ? `Removed from the library: ${entry.label}` : `Excluded ${formatDate(entry.addedAt).toLowerCase()}`}</div>
              </div>
              <button type="button" onClick={() => void remove(entry)} className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-raised hover:text-ink">
                Look here again
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RootRow({ root }: { root: LibraryRoot }) {
  const { refreshRoots, setError } = useLauncher()

  async function run(task: () => Promise<void>) {
    try {
      await task()
      await refreshRoots()
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <li className="flex items-center gap-4 px-5 py-4">
      <label className="relative inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={root.enabled}
          onChange={(event) => void run(() => window.api.roots.setEnabled(root.id, event.target.checked))}
          aria-label={`Scan ${root.path}`}
        />
        <span className="h-5 w-9 rounded-full bg-raised transition-colors peer-checked:bg-accent" />
        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-ink transition-transform peer-checked:translate-x-4" />
      </label>
      <div className="min-w-0 flex-1">
        <div className="truncate">{root.path}</div>
        <div className="text-xs text-muted">
          {root.available ? `Last scanned ${formatDate(root.lastScannedAt).toLowerCase()}` : 'Not reachable right now'}
          {root.category === 'noisy' ? '. Only clear game folders are picked up here' : ''}
        </div>
      </div>
      {root.kind === 'user' && (
        <button type="button" onClick={() => void run(() => window.api.roots.remove(root.id))} className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-raised hover:text-danger">
          Remove
        </button>
      )}
    </li>
  )
}

/** Settings section: the folders scanned for games. */
export function LocationsSection() {
  const { roots, refreshRoots, startScan } = useLauncher()
  const userRoots = roots.filter((root) => root.kind === 'user')
  const autoRoots = roots.filter((root) => root.kind === 'auto')

  async function addLocation() {
    const added = await window.api.roots.add()
    if (!added) return
    await refreshRoots()
    await startScan(true)
  }

  return (
    <section className="flex flex-col gap-5 rounded-lg bg-surface px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Game locations</h2>
          <p className="mt-1 text-sm text-muted">Folders Orus checks for games. Turn one off to skip it on the next scan.</p>
        </div>
        <button type="button" onClick={() => void addLocation()} className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-bright hover:text-black">
          Add folder
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Your folders</h3>
        {userRoots.length === 0 ? (
          <p className="rounded-md bg-canvas px-5 py-4 text-sm text-muted">Add the folders where you keep games so they are always checked.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md bg-canvas">
            {userRoots.map((root) => (
              <RootRow key={root.id} root={root} />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Found automatically</h3>
        <p className="text-sm text-muted">Common game folders on every drive. Steam, Epic, installed programs and desktop shortcuts are always checked too.</p>
        <ul className="divide-y divide-line rounded-md bg-canvas">
          {autoRoots.map((root) => (
            <RootRow key={root.id} root={root} />
          ))}
        </ul>
      </div>

      <ExcludedFolders />
    </section>
  )
}
