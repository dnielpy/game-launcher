import { ProgramList } from '../components/ProgramList'
import { errorMessage, useLauncher } from '../store'

export function EmulatorsView() {
  const { games, refresh, setError, select } = useLauncher()
  const emulators = games.filter((game) => game.category === 'emulator' && !game.hidden)

  async function add() {
    try {
      const added = await window.api.emulators.add()
      if (!added) return
      await refresh()
      select(added.id)
    } catch (error) {
      setError(errorMessage(error))
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6 pb-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Emulators</h1>
          <p className="mt-2 text-muted">Emulators found on your drives and the ones you add. Orus counts the time you spend in each one.</p>
        </div>
        <button type="button" onClick={() => void add()} className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-bright hover:text-black">
          Add emulator
        </button>
      </div>
      <ProgramList programs={emulators} removable empty="No emulators yet. Add one by choosing its .exe file." />
    </div>
  )
}

export function ToolsView() {
  const games = useLauncher((state) => state.games)
  const tools = games.filter((game) => game.category === 'tool' && !game.hidden)
  return (
    <div className="flex max-w-3xl flex-col gap-6 pb-10">
      <div>
        <h1 className="font-display text-3xl font-semibold">Tools</h1>
        <p className="mt-2 text-muted">Launchers and utilities found next to your games. Move anything to another section from its Manage tab.</p>
      </div>
      <ProgramList programs={tools} removable empty="No tools found." />
    </div>
  )
}
