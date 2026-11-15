import { formatBytes } from '../format'
import { useLauncher } from '../store'

export function InstallersView() {
  const installers = useLauncher((state) => state.installers)
  return (
    <div className="flex max-w-3xl flex-col gap-6 pb-10">
      <div>
        <h1 className="font-display text-3xl font-semibold">Not installed</h1>
        <p className="mt-2 text-muted">Game installers found in your locations. Install them and scan again to add them to your library.</p>
      </div>
      {installers.length === 0 ? (
        <p className="py-10 text-muted">No pending installers.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg bg-surface">
          {installers.map((installer) => (
            <li key={installer.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <div className="truncate">{installer.title}</div>
                <div className="truncate text-xs text-muted">{installer.path}</div>
              </div>
              <span className="shrink-0 text-sm text-muted">{formatBytes(installer.sizeBytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
