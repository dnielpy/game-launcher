import { useEffect } from 'react'
import { GameDetail } from './components/GameDetail'
import { ScanStatus } from './components/ScanStatus'
import { Sidebar } from './components/Sidebar'
import { connectScanEvents, useLauncher } from './store'
import { HomeView } from './views/HomeView'
import { InstallersView } from './views/InstallersView'
import { LibraryView } from './views/LibraryView'
import { LocationsView } from './views/LocationsView'

export function App() {
  const { view, error, dismissError, refresh, refreshRoots } = useLauncher()

  useEffect(() => {
    const disconnect = connectScanEvents()
    void refresh()
    void refreshRoots()
    void window.api.scan.isRunning().then((running) => running && useLauncher.setState({ scanning: true }))
    return disconnect
  }, [refresh, refreshRoots])

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-end border-b border-line px-8">
          <ScanStatus />
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
          {view === 'installers' && <InstallersView />}
          {view === 'locations' && <LocationsView />}
        </main>
      </div>
      <GameDetail />
    </div>
  )
}
