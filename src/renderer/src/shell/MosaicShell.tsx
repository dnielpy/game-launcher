import { OrusMark } from '../components/OrusMark'
import { ScanStatus } from '../components/ScanStatus'
import { useLauncher } from '../store'
import { MosaicHome } from '../views/MosaicHome'
import { Clock, ErrorBanner, greeting, NAV_ITEMS, NavIcon, ProfileButton, SectionContent } from './common'

const RAIL_STEP = 60

/** Icon rail: a pill slides behind the active icon, names appear on hover. */
function Rail() {
  const { view, setView } = useLauncher()
  const updateReady = useLauncher((state) => state.update?.state === 'available' || state.update?.state === 'downloaded')
  const main = NAV_ITEMS.filter((item) => item.view !== 'settings')
  const settings = NAV_ITEMS.find((item) => item.view === 'settings')!
  const activeIndex = main.findIndex((item) => item.view === view)

  return (
    <nav className="flex w-[76px] shrink-0 flex-col items-center border-r border-line bg-surface py-5">
      <button type="button" onClick={() => setView('home')} className="mb-8" aria-label="Orus">
        <OrusMark className="h-9 w-9" />
      </button>
      <div className="relative flex flex-col gap-3">
        <span
          className="pointer-events-none absolute left-0 h-12 w-12 rounded-lg bg-accent/12 transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"
          style={{ transform: `translateY(${Math.max(0, activeIndex) * RAIL_STEP}px)`, opacity: activeIndex < 0 ? 0 : 1 }}
        />
        {main.map((item) => (
          <RailButton key={item.view} label={item.label} icon={item.icon} active={item.view === view} onClick={() => setView(item.view)} />
        ))}
      </div>
      <div className="mt-auto">
        <RailButton label={settings.label} icon={settings.icon} active={view === 'settings'} onClick={() => setView('settings')} dot={updateReady} solid />
      </div>
    </nav>
  )
}

function RailButton({ label, icon, active, onClick, dot = false, solid = false }: { label: string; icon: string; active: boolean; onClick: () => void; dot?: boolean; solid?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex h-12 w-12 items-center justify-center rounded-lg transition-colors ${active ? 'text-accent' : 'text-muted hover:text-ink'} ${solid && active ? 'bg-accent/12' : ''}`}
    >
      <NavIcon path={icon} className="h-[22px] w-[22px]" />
      {dot && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent-bright" />}
      <span className="pointer-events-none absolute left-[58px] z-30 whitespace-nowrap rounded-md bg-ink px-2.5 py-1 text-xs font-semibold text-surface opacity-0 shadow-lg transition-[opacity,transform] duration-150 group-hover:translate-x-1 group-hover:opacity-100">
        {label}
      </span>
    </button>
  )
}

/** Mosaic: a light theme, an icon rail on the left and Home as a grid of tiles. */
export function MosaicShell() {
  const { view, profile } = useLauncher()
  const name = profile?.created ? `, ${profile.name}` : ''

  return (
    <div className="flex h-full bg-canvas">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[76px] shrink-0 items-center gap-6 px-10">
          <div>
            <div className="font-display text-xl font-semibold">
              {greeting()}
              {name}
            </div>
            <div className="text-xs text-muted">
              {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} · <Clock />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-5">
            <ScanStatus />
            <ProfileButton />
          </div>
        </header>
        <ErrorBanner />
        <main className="min-h-0 flex-1 overflow-y-auto px-10 pb-10 pt-2">
          {view === 'home' ? (
            <div key="home" className="view-enter">
              <MosaicHome />
            </div>
          ) : (
            <SectionContent />
          )}
        </main>
      </div>
    </div>
  )
}
