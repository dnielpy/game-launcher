import type { Game } from '@shared/types'
import { iconUrl } from '../format'
import { errorMessage, useLauncher } from '../store'

function ToolRow({ tool }: { tool: Game }) {
  const { select, setError, runningGameIds } = useLauncher()
  const icon = iconUrl(tool.iconPath)
  const running = runningGameIds.includes(tool.id)

  async function open() {
    try {
      await window.api.library.launch(tool.id)
    } catch (error) {
      setError(errorMessage(error))
    }
  }

  return (
    <li className="flex items-center gap-4 px-5 py-3.5">
      {icon ? <img src={icon} alt="" className="h-9 w-9 shrink-0 object-contain" /> : <span className="h-9 w-9 shrink-0 rounded-md bg-raised" />}
      <button type="button" onClick={() => select(tool.id)} className="min-w-0 flex-1 text-left">
        <div className="truncate">{tool.title}</div>
        <div className="truncate text-xs text-muted">{tool.installPath}</div>
      </button>
      <button
        type="button"
        disabled={running || tool.launch === null || tool.status !== 'installed'}
        onClick={() => void open()}
        className="rounded-md bg-raised px-4 py-2 text-sm hover:bg-line disabled:opacity-50"
      >
        {running ? 'Running' : 'Open'}
      </button>
    </li>
  )
}

export function ToolsView() {
  const games = useLauncher((state) => state.games)
  const tools = games.filter((game) => game.category === 'tool' && !game.hidden)

  return (
    <div className="flex max-w-3xl flex-col gap-6 pb-10">
      <div>
        <h1 className="font-display text-3xl font-semibold">Tools</h1>
        <p className="mt-2 text-muted">Launchers, emulators and utilities found next to your games. Move anything between Tools and your library from its Manage tab.</p>
      </div>
      {tools.length === 0 ? (
        <p className="py-10 text-muted">No tools found.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg bg-surface">
          {tools.map((tool) => (
            <ToolRow key={tool.id} tool={tool} />
          ))}
        </ul>
      )}
    </div>
  )
}
