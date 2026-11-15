import { formatBytes } from '../format'
import { useLauncher } from '../store'

export function InstallersView() {
  const installers = useLauncher((state) => state.installers)
  const setups = installers.filter((installer) => installer.kind === 'installer')
  const updates = installers.filter((installer) => installer.kind === 'update')

  const list = (items: typeof installers) => (
    <ul className="flex flex-col divide-y divide-line rounded-lg bg-surface">
      {items.map((installer) => (
        <li key={installer.id} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="truncate">{installer.title}</div>
            <div className="truncate text-xs text-muted">{installer.path}</div>
          </div>
          <span className="shrink-0 text-sm text-muted">{formatBytes(installer.sizeBytes)}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="flex max-w-3xl flex-col gap-8 pb-10">
      <div>
        <h1 className="font-display text-3xl font-semibold">Not installed</h1>
        <p className="mt-2 text-muted">Installers and game updates found in your folders. Install them and scan again to see the game in your library.</p>
      </div>
      {installers.length === 0 && <p className="py-10 text-muted">No pending installers or updates.</p>}
      {setups.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Installers</h2>
          {list(setups)}
        </section>
      )}
      {updates.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Game updates</h2>
          {list(updates)}
        </section>
      )}
    </div>
  )
}
