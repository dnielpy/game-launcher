import { useLauncher, type View } from '../store'

const ITEMS: { view: View; label: string; icon: string }[] = [
  { view: 'home', label: 'Home', icon: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z' },
  { view: 'library', label: 'My library', icon: 'M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.8-1 3 15.4-3.8 1z' },
  { view: 'installers', label: 'Not installed', icon: 'M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3' },
  { view: 'locations', label: 'Locations', icon: 'M3 6h7l2 2h9v11H3z' }
]

export function Sidebar() {
  const view = useLauncher((state) => state.view)
  const setView = useLauncher((state) => state.setView)
  const installers = useLauncher((state) => state.installers.length)

  return (
    <nav className="flex w-60 shrink-0 flex-col gap-1 border-r border-line bg-surface px-3 py-5">
      <div className="mb-6 px-3 font-display text-lg font-semibold tracking-tight">Game Launcher</div>
      {ITEMS.map((item) => {
        const active = item.view === view
        return (
          <button
            key={item.view}
            type="button"
            onClick={() => setView(item.view)}
            className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
              active ? 'bg-raised text-ink' : 'text-muted hover:bg-raised/60 hover:text-ink'
            }`}
          >
            {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent-bright" />}
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round">
              <path d={item.icon} />
            </svg>
            <span className="flex-1 text-left">{item.label}</span>
            {item.view === 'installers' && installers > 0 && <span className="text-xs text-muted">{installers}</span>}
          </button>
        )
      })}
    </nav>
  )
}
