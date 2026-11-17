import { useEffect } from 'react'
import { ConfirmDialog } from './components/ConfirmDialog'
import { GameModal } from './components/GameModal'
import { ProfileModal } from './components/ProfileModal'
import { ScanOverlay } from './components/ScanOverlay'
import { CinemaShell } from './shell/CinemaShell'
import { MosaicShell } from './shell/MosaicShell'
import { OrusShell } from './shell/OrusShell'
import { connectEvents, useLauncher } from './store'

export function App() {
  const { skin, refresh, refreshRoots } = useLauncher()

  useEffect(() => {
    const disconnect = connectEvents()
    void refresh()
    void refreshRoots()
    void window.api.scan.isRunning().then((running) => running && useLauncher.setState({ scanning: true }))
    void window.api.metadata.getProgress().then((metadataProgress) => useLauncher.setState({ metadataProgress }))
    return disconnect
  }, [refresh, refreshRoots])

  return (
    <>
      {skin === 'cinema' ? <CinemaShell /> : skin === 'mosaic' ? <MosaicShell /> : <OrusShell />}
      <GameModal />
      <ProfileModal />
      <ScanOverlay />
      <ConfirmDialog />
    </>
  )
}
