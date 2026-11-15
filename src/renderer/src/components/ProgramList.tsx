import type { Game } from '@shared/types'
import { formatHoursShort, iconUrl } from '../format'
import { errorMessage, useLauncher } from '../store'

function ProgramRow({ program, removable }: { program: Game; removable: boolean }) {
  const { select, setError, refresh, runningGameIds } = useLauncher()
  const icon = iconUrl(program.iconPath)
  const running = runningGameIds.includes(program.id)

  async function run(task: () => Promise<void>) {
    try {
      await task()
      await refresh()
    } catch (error) {
      setError(errorMessage(error))
    }
  }

  return (
    <li className="flex items-center gap-4 px-5 py-3.5">
      {icon ? <img src={icon} alt="" className="h-9 w-9 shrink-0 object-contain" /> : <span className="h-9 w-9 shrink-0 rounded-md bg-raised" />}
      <button type="button" onClick={() => select(program.id)} className="min-w-0 flex-1 text-left">
        <div className="truncate">{program.title}</div>
        <div className="truncate text-xs text-muted">
          {program.status !== 'installed' ? 'Not found on disk' : program.launch?.type === 'exe' ? program.launch.exePath : program.installPath}
        </div>
      </button>
      {program.playtimeSeconds > 0 && <span className="shrink-0 text-xs text-muted">{formatHoursShort(program.playtimeSeconds)}</span>}
      {removable && (
        <button type="button" onClick={() => void run(() => window.api.library.remove(program.id))} className="rounded-md px-3 py-2 text-sm text-muted hover:bg-raised hover:text-danger">
          Remove
        </button>
      )}
      <button
        type="button"
        disabled={running || program.launch === null || program.status !== 'installed'}
        onClick={() => void run(() => window.api.library.launch(program.id))}
        className="rounded-md bg-raised px-4 py-2 text-sm hover:bg-line disabled:opacity-50"
      >
        {running ? 'Running' : 'Open'}
      </button>
    </li>
  )
}

export function ProgramList({ programs, empty, removable = false }: { programs: Game[]; empty: string; removable?: boolean }) {
  if (programs.length === 0) return <p className="rounded-lg bg-surface px-5 py-6 text-sm text-muted">{empty}</p>
  return (
    <ul className="flex flex-col divide-y divide-line rounded-lg bg-surface">
      {programs.map((program) => (
        <ProgramRow key={program.id} program={program} removable={removable} />
      ))}
    </ul>
  )
}
