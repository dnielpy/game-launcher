import { useLauncher, type View } from '../store'
import { OrusMark } from './OrusMark'

const ITEMS: { view: View; label: string; icon: string }[] = [
  { view: 'home', label: 'Home', icon: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z' },
  { view: 'library', label: 'My library', icon: 'M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.8-1 3 15.4-3.8 1z' },
  { view: 'emulators', label: 'Emulators', icon: 'M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-4 3.6l-.7 6.3A3 3 0 0 0 5 18.2c1 0 1.9-.5 2.5-1.3L9 15h6l1.5 1.9c.6.8 1.5 1.3 2.5 1.3a3 3 0 0 0 3-3.3l-.7-6.3A4 4 0 0 0 17.3 5z' },
  { view: 'tools', label: 'Tools', icon: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z' },
  { view: 'settings', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' }
]

export function Sidebar() {
  const view = useLauncher((state) => state.view)
  const setView = useLauncher((state) => state.setView)
  const toolCount = useLauncher((state) => state.games.filter((game) => game.category === 'tool' && !game.hidden).length)
  const emulatorCount = useLauncher((state) => state.games.filter((game) => game.category === 'emulator' && !game.hidden).length)
  const updateReady = useLauncher((state) => state.update?.state === 'available' || state.update?.state === 'downloaded')

  return (
    <nav className="flex w-60 shrink-0 flex-col gap-1 border-r border-line bg-surface px-3 py-5">
      <div className="mb-7 flex items-center gap-2.5 px-2">
        <OrusMark className="h-8 w-8" />
        <span className="font-display text-xl font-semibold tracking-tight">Orus</span>
      </div>
      {ITEMS.map((item) => {
        const active = item.view === view
        const count = item.view === 'tools' ? toolCount : item.view === 'emulators' ? emulatorCount : 0
        return (
          <button
            key={item.view}
            type="button"
            onClick={() => setView(item.view)}
            className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
              active ? 'bg-raised text-ink' : 'text-muted hover:bg-raised/60 hover:text-ink'
            } ${item.view === 'settings' ? 'mt-auto' : ''}`}
          >
            {active && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-accent-bright" />}
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round">
              <path d={item.icon} />
            </svg>
            <span className="flex-1 text-left">{item.label}</span>
            {count > 0 && <span className="text-xs text-muted">{count}</span>}
            {item.view === 'settings' && updateReady && <span className="h-2 w-2 rounded-full bg-accent-bright" aria-label="Update available" />}
          </button>
        )
      })}
    </nav>
  )
}
