import { useLayoutEffect, useRef, useState } from 'react'
import { OrusMark } from '../components/OrusMark'
import { ScanStatus } from '../components/ScanStatus'
import { WindowControls } from '../components/WindowControls'
import { useLauncher } from '../store'
import { CinemaHome } from '../views/CinemaHome'
import { Clock, ErrorBanner, NAV_ITEMS, NavIcon, ProfileButton, SectionContent } from './common'

/** Text tabs along the top with an underline that glides to the active one. */
function TopTabs() {
  const { view, setView } = useLauncher()
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null)
  const tabs = NAV_ITEMS.filter((item) => item.view !== 'settings')

  useLayoutEffect(() => {
    const element = refs.current.get(view)
    setBar(element ? { left: element.offsetLeft, width: element.offsetWidth } : null)
  }, [view])

  return (
    <div className="relative flex items-center gap-1" role="tablist">
      {tabs.map((item) => (
        <button
          key={item.view}
          ref={(element) => {
            if (element) refs.current.set(item.view, element)
          }}
          type="button"
          role="tab"
          aria-selected={view === item.view}
          onClick={() => setView(item.view)}
          className={`px-4 py-2 font-display text-[15px] tracking-wide transition-colors duration-200 ${view === item.view ? 'text-ink' : 'text-ink/55 hover:text-ink'}`}
        >
          {item.label}
        </button>
      ))}
      <span
        className="pointer-events-none absolute -bottom-0.5 h-[3px] rounded-full bg-accent-bright shadow-[0_0_12px_var(--color-accent-bright)] transition-all duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"
        style={bar ? { left: bar.left + 14, width: bar.width - 28, opacity: 1 } : { opacity: 0 }}
      />
    </div>
  )
}

/** Cinema: navigation along the top, Home as a full-screen stage. */
export function CinemaShell() {
  const { view, setView } = useLauncher()
  const onHome = view === 'home'

  return (
    <div className="relative h-full overflow-hidden bg-canvas">
      <header
        className={`absolute inset-x-0 top-0 z-20 flex h-[72px] items-center gap-8 px-10 transition-colors duration-300 ${onHome ? 'bg-gradient-to-b from-black/70 to-transparent' : 'border-b border-line bg-canvas/90 backdrop-blur'}`}
      >
        <button type="button" onClick={() => setView('home')} className="flex items-center gap-2.5" aria-label="Home">
          <OrusMark className="h-7 w-7" />
        </button>
        <TopTabs />
        <div className="ml-auto flex items-center gap-5">
          <ScanStatus />
          <Clock className="font-display text-lg text-ink/80" />
          <button
            type="button"
            onClick={() => setView('settings')}
            aria-label="Settings"
            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${view === 'settings' ? 'bg-ink text-canvas' : 'text-ink/70 hover:bg-white/10 hover:text-ink'}`}
          >
            <NavIcon path={NAV_ITEMS.find((item) => item.view === 'settings')!.icon} />
          </button>
          <ProfileButton />
          <WindowControls />
        </div>
      </header>

      {onHome ? (
        <div key="home" className="absolute inset-0 motion-safe:animate-[fade-in_400ms_ease-out]">
          <CinemaHome />
          <div className="absolute inset-x-0 top-[72px] z-20">
            <ErrorBanner />
          </div>
        </div>
      ) : (
        <main className="h-full overflow-y-auto px-12 pb-10 pt-[104px]">
          <div className="-mx-12 -mt-8 mb-6">
            <ErrorBanner />
          </div>
          <SectionContent />
        </main>
      )}
    </div>
  )
}
