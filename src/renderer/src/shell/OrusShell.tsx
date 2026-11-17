import { ScanStatus } from '../components/ScanStatus'
import { Sidebar } from '../components/Sidebar'
import { WindowControls } from '../components/WindowControls'
import { useLauncher } from '../store'
import { HomeView } from '../views/HomeView'
import { ErrorBanner, ProfileButton, SectionContent } from './common'

/** Orus, the original skin: sidebar on the left, rows of covers on Home. */
export function OrusShell() {
  const view = useLauncher((state) => state.view)
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-end gap-5 border-b border-line px-8">
          <ScanStatus />
          <ProfileButton />
          <WindowControls />
        </header>
        <ErrorBanner />
        <main className="min-h-0 flex-1 overflow-y-auto px-8 pt-8">
          {view === 'home' ? (
            <div key="home" className="view-enter h-full">
              <HomeView />
            </div>
          ) : (
            <SectionContent />
          )}
        </main>
      </div>
    </div>
  )
}
