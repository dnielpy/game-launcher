import { useEffect, useState } from 'react'
import { Avatar } from '../components/Avatar'
import { useLauncher, type View } from '../store'
import { LibraryView } from '../views/LibraryView'
import { EmulatorsView, ToolsView } from '../views/ProgramsView'
import { SettingsView } from '../views/SettingsView'

export const NAV_ITEMS: { view: View; label: string; icon: string }[] = [
  { view: 'home', label: 'Home', icon: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z' },
  { view: 'library', label: 'My library', icon: 'M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.8-1 3 15.4-3.8 1z' },
  { view: 'emulators', label: 'Emulators', icon: 'M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-4 3.6l-.7 6.3A3 3 0 0 0 5 18.2c1 0 1.9-.5 2.5-1.3L9 15h6l1.5 1.9c.6.8 1.5 1.3 2.5 1.3a3 3 0 0 0 3-3.3l-.7-6.3A4 4 0 0 0 17.3 5z' },
  { view: 'tools', label: 'Tools', icon: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z' },
  { view: 'settings', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' }
]

export function NavIcon({ path, className = 'h-5 w-5' }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <path d={path} />
    </svg>
  )
}

export function ErrorBanner() {
  const { error, dismissError } = useLauncher()
  if (!error) return null
  return (
    <div role="alert" className="flex items-center justify-between gap-4 bg-danger/15 px-8 py-3 text-sm">
      <span>{error}</span>
      <button type="button" onClick={dismissError} className="text-muted hover:text-ink">
        Dismiss
      </button>
    </div>
  )
}

export function ProfileButton({ className = 'h-10 w-10' }: { className?: string }) {
  const { profile, openProfile } = useLauncher()
  return (
    <button
      type="button"
      onClick={() => openProfile(true)}
      className="shrink-0 rounded-full ring-accent-bright transition-shadow hover:ring-2 focus-visible:ring-2"
      aria-label={profile?.created ? `Profile of ${profile.name}` : 'Create your profile'}
      title={profile?.created ? profile.name : 'Create your profile'}
    >
      <Avatar profile={profile} className={className} />
    </button>
  )
}

/** Current time, refreshed every 15 seconds. */
export function Clock({ className = '' }: { className?: string }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(timer)
  }, [])
  return (
    <time dateTime={now.toISOString()} className={`tabular-nums ${className}`}>
      {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
    </time>
  )
}

/** Every section except Home, which each skin draws itself. Re-keyed per section so it animates in. */
export function SectionContent() {
  const view = useLauncher((state) => state.view)
  return (
    <div key={view} className="view-enter">
      {view === 'library' && <LibraryView />}
      {view === 'emulators' && <EmulatorsView />}
      {view === 'tools' && <ToolsView />}
      {view === 'settings' && <SettingsView />}
    </div>
  )
}

export function greeting(date = new Date()): string {
  const hour = date.getHours()
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 19) return 'Good afternoon'
  return 'Good evening'
}
