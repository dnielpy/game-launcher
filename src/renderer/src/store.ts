import { create } from 'zustand'
import type { Game, LibraryRoot, MetadataProgress, PendingInstaller, ScanProgress, ScanSummary, UpdateStatus } from '@shared/types'

export type View = 'home' | 'library' | 'emulators' | 'tools' | 'settings'

interface LauncherState {
  view: View
  games: Game[]
  installers: PendingInstaller[]
  roots: LibraryRoot[]
  runningGameIds: number[]
  selectedGameId: number | null
  scanning: boolean
  progress: ScanProgress | null
  metadataProgress: MetadataProgress | null
  /** The full-screen progress card. Hidden when the user sends the scan to the background. */
  overlayVisible: boolean
  /** The user sent the current scan to the background; do not pop the card up again. */
  overlayDismissed: boolean
  lastSummary: ScanSummary | null
  update: UpdateStatus | null
  error: string | null
  loaded: boolean
  setView: (view: View) => void
  select: (id: number | null) => void
  refresh: () => Promise<void>
  refreshRoots: () => Promise<void>
  startScan: (showOverlay?: boolean) => Promise<void>
  cancelScan: () => Promise<void>
  hideOverlay: () => void
  dismissError: () => void
  setError: (message: string) => void
}

export const useLauncher = create<LauncherState>((set, get) => ({
  view: 'home',
  games: [],
  installers: [],
  roots: [],
  runningGameIds: [],
  selectedGameId: null,
  scanning: false,
  progress: null,
  metadataProgress: null,
  overlayVisible: false,
  overlayDismissed: false,
  lastSummary: null,
  update: null,
  error: null,
  loaded: false,

  setView: (view) => set({ view }),
  select: (selectedGameId) => set({ selectedGameId }),

  refresh: async () => {
    const [games, installers] = await Promise.all([window.api.library.list(), window.api.installers.list()])
    set({ games, installers, loaded: true })
  },

  refreshRoots: async () => set({ roots: await window.api.roots.list() }),

  startScan: async (showOverlay = true) => {
    if (get().scanning) return
    set({ scanning: true, progress: null, error: null, overlayVisible: showOverlay, overlayDismissed: !showOverlay })
    await window.api.scan.start()
  },

  cancelScan: async () => window.api.scan.cancel(),
  hideOverlay: () => set({ overlayVisible: false, overlayDismissed: true }),
  dismissError: () => set({ error: null }),
  setError: (message) => set({ error: message })
}))

export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  // Electron prefixes errors thrown in IPC handlers.
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** Wires main-process events into the store. Call once at startup. */
export function connectEvents(): () => void {
  const offProgress = window.api.scan.onProgress((progress) => {
    const state = useLauncher.getState()
    // A scan started by the app itself (on launch) shows the big card only while the library is empty.
    const overlayVisible = !state.overlayDismissed && (state.overlayVisible || (state.loaded && state.games.length === 0))
    useLauncher.setState({ scanning: true, progress, overlayVisible })
  })
  const offFinished = window.api.scan.onFinished(async ({ summary, error }) => {
    useLauncher.setState({ scanning: false, progress: null, lastSummary: summary, error, overlayDismissed: useLauncher.getState().overlayDismissed })
    await Promise.all([useLauncher.getState().refresh(), useLauncher.getState().refreshRoots()])
    // Keep the card open while covers download after a first scan.
    const metadata = useLauncher.getState().metadataProgress
    if (!metadata?.running) useLauncher.setState({ overlayVisible: false })
  })
  const offMetadata = window.api.metadata.onProgress((metadataProgress) => {
    useLauncher.setState({ metadataProgress })
    if (!metadataProgress.running && !useLauncher.getState().scanning) useLauncher.setState({ overlayVisible: false })
  })
  const offChanged = window.api.library.onChanged(({ runningGameIds }) => {
    useLauncher.setState({ runningGameIds })
    void useLauncher.getState().refresh()
  })
  const offUpdates = window.api.updates.onStatus((update) => useLauncher.setState({ update }))
  void window.api.updates.get().then((update) => useLauncher.setState({ update }))
  return () => {
    offUpdates()
    offProgress()
    offFinished()
    offMetadata()
    offChanged()
  }
}
