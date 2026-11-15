import type { LibraryRoot } from '@shared/types'
import { formatDate } from '../format'
import { useLauncher } from '../store'

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
    </section>
  )
}
