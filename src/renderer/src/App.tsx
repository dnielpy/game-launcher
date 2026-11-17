import { useEffect } from 'react'
import { Avatar } from './components/Avatar'
import { GameModal } from './components/GameModal'
import { ProfileModal } from './components/ProfileModal'
import { ScanOverlay } from './components/ScanOverlay'
import { ScanStatus } from './components/ScanStatus'
import { Sidebar } from './components/Sidebar'
import { connectEvents, useLauncher } from './store'
import { HomeView } from './views/HomeView'
import { LibraryView } from './views/LibraryView'
import { EmulatorsView, ToolsView } from './views/ProgramsView'
import { SettingsView } from './views/SettingsView'

export function App() {
  const { view, error, dismissError, refresh, refreshRoots, profile, openProfile } = useLauncher()

  useEffect(() => {
    const disconnect = connectEvents()
    void refresh()
    void refreshRoots()
    void window.api.scan.isRunning().then((running) => running && useLauncher.setState({ scanning: true }))
    void window.api.metadata.getProgress().then((metadataProgress) => useLauncher.setState({ metadataProgress }))
    return disconnect
  }, [refresh, refreshRoots])

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-end border-b border-line px-8">
          <ScanStatus />
          <button
            type="button"
            onClick={() => openProfile(true)}
            className="ml-5 rounded-full ring-accent-bright transition-shadow hover:ring-2 focus-visible:ring-2"
            aria-label={profile?.created ? `Profile of ${profile.name}` : 'Create your profile'}
            title={profile?.created ? profile.name : 'Create your profile'}
          >
            <Avatar profile={profile} />
          </button>
        </header>
        {error && (
          <div role="alert" className="flex items-center justify-between gap-4 bg-danger/15 px-8 py-3 text-sm">
            <span>{error}</span>
            <button type="button" onClick={dismissError} className="text-muted hover:text-ink">
              Dismiss
            </button>
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto px-8 pt-8">
          {view === 'home' && <HomeView />}
          {view === 'library' && <LibraryView />}
          {view === 'emulators' && <EmulatorsView />}
          {view === 'tools' && <ToolsView />}
          {view === 'settings' && <SettingsView />}
        </main>
      </div>
      <GameModal />
      <ProfileModal />
      <ScanOverlay />
    </div>
  )
}
