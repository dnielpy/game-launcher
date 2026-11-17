import type { ReactNode } from 'react'
import { AboutSection } from '../components/AboutSection'
import { CoversSection } from '../components/CoversSection'
import { DataSection } from '../components/DataSection'
import { EmulationSection } from '../components/EmulationSection'
import { SkinsSection } from '../components/SkinsSection'
import { LocationsSection } from '../components/LocationsSection'
import { UpdatesSection } from '../components/UpdatesSection'
import { useLauncher, type SettingsModule } from '../store'

interface ModuleEntry {
  id: SettingsModule
  title: string
  description: string
  icon: string
  render: () => ReactNode
}

const MODULES: ModuleEntry[] = [
  {
    id: 'appearance',
    title: 'Skins',
    description: 'Change how Orus looks: Orus, Cinema or Mosaic',
    icon: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-7.9-9-7.9zM7.5 12h.01M9.5 8h.01M14.5 8h.01',
    render: () => <SkinsSection />
  },
  {
    id: 'updates',
    title: 'Updates',
    description: 'Check for new versions of Orus and install them',
    icon: 'M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5',
    render: () => <UpdatesSection />
  },
  {
    id: 'locations',
    title: 'Game locations',
    description: 'Folders Orus checks for games',
    icon: 'M3 6h7l2 2h9v11H3z',
    render: () => <LocationsSection />
  },
  {
    id: 'emulation',
    title: 'Emulated games',
    description: 'Find Nintendo Switch games and play them with your emulator',
    icon: 'M8 4h3v16H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4zM13 4h3a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-3z',
    render: () => <EmulationSection />
  },
  {
    id: 'covers',
    title: 'Covers and game details',
    description: 'Where box art, banners and ratings come from, and the optional keys',
    icon: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5',
    render: () => <CoversSection />
  },
  {
    id: 'data',
    title: 'Backup and restore',
    description: 'Export or import your games, hours, covers and profile',
    icon: 'M12 3v12M7 10l5 5 5-5M4 19h16',
    render: () => <DataSection />
  },
  {
    id: 'about',
    title: 'About Orus',
    description: 'Version, developer and contact',
    icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
    render: () => <AboutSection />
  }
]

function ModuleIcon({ path }: { path: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-raised text-accent-bright">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round">
        <path d={path} />
      </svg>
    </span>
  )
}

export function SettingsView() {
  const { settingsModule, openSettings, update } = useLauncher()
  const current = MODULES.find((module) => module.id === settingsModule)

  if (current) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-10">
        <button type="button" onClick={() => openSettings(null)} className="flex items-center gap-2 self-start text-sm text-muted hover:text-ink">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Settings
        </button>
        {current.render()}
      </div>
    )
  }

  const updateReady = update?.state === 'available' || update?.state === 'downloaded'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-10">
      <h1 className="font-display text-3xl font-semibold">Settings</h1>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-surface">
        {MODULES.map((module) => (
          <li key={module.id}>
            <button type="button" onClick={() => openSettings(module.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-raised/60">
              <ModuleIcon path={module.icon} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{module.title}</span>
                <span className="block truncate text-sm text-muted">
                  {module.id === 'updates' && updateReady ? `Orus ${update!.latest?.version} is ready to install` : module.description}
                </span>
              </span>
              {module.id === 'updates' && updateReady && <span className="h-2 w-2 rounded-full bg-accent-bright" aria-label="Update available" />}
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
