import { useEffect } from 'react'
import { GamepadNavigation } from './gamepad/GamepadNavigation'
import { ConfirmDialog } from './components/ConfirmDialog'
import { GameModal } from './components/GameModal'
import { OrusMark } from './components/OrusMark'
import { ProfileModal } from './components/ProfileModal'
import { ScanOverlay } from './components/ScanOverlay'
import { StatsModal } from './components/StatsModal'
import { HardwareView } from './views/HardwareView'
import { CinemaShell } from './shell/CinemaShell'
import { MosaicShell } from './shell/MosaicShell'
import { OrusShell } from './shell/OrusShell'
import { connectEvents, useLauncher } from './store'
import { Onboarding } from './views/Onboarding'

/** Covers the app while everything is backed up and deleted, until Orus restarts. */
function ResetScreen() {
  const resetting = useLauncher((state) => state.resetting)
  if (!resetting) return null
  return (
    <div data-gamepad-scope="70" className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-canvas motion-safe:animate-[fade-in_300ms_ease-out]">
      <OrusMark className="h-20 w-20 animate-pulse" />
      <p className="text-lg">{resetting === 'saving' ? 'Saving and checking your backup…' : 'Starting over…'}</p>
    </div>
  )
}

export function App() {
  const { skin, refresh, refreshRoots, app } = useLauncher()

  useEffect(() => {
    const disconnect = connectEvents()
    void refresh()
    void refreshRoots()
    void window.api.scan.isRunning().then((running) => running && useLauncher.setState({ scanning: true }))
    void window.api.metadata.getProgress().then((metadataProgress) => useLauncher.setState({ metadataProgress }))
    return disconnect
  }, [refresh, refreshRoots])

  if (!app) return null
  if (!app.onboardingDone) {
    return (
      <>
        <GamepadNavigation />
        <Onboarding />
        <ConfirmDialog />
      </>
    )
  }

  return (
    <>
      <GamepadNavigation />
      {skin === 'cinema' ? <CinemaShell /> : skin === 'mosaic' ? <MosaicShell /> : <OrusShell />}
      <GameModal />
      <ProfileModal />
      <StatsModal />
      <HardwareView />
      <ScanOverlay />
      <ConfirmDialog />
      <ResetScreen />
    </>
  )
}
