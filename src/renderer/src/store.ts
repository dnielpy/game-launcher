import { create } from 'zustand'
import type { Game, LibraryRoot, PendingInstaller, ScanProgress, ScanSummary } from '@shared/types'

export type View = 'home' | 'library' | 'installers' | 'locations'

interface LauncherState {
  view: View
  games: Game[]
  installers: PendingInstaller[]
  roots: LibraryRoot[]
  selectedGameId: number | null
  scanning: boolean
  progress: ScanProgress | null
  lastSummary: ScanSummary | null
  error: string | null
  setView: (view: View) => void
  select: (id: number | null) => void
  refresh: () => Promise<void>
  refreshRoots: () => Promise<void>
  startScan: () => Promise<void>
  cancelScan: () => Promise<void>
  dismissError: () => void
  setError: (message: string) => void
}

export const useLauncher = create<LauncherState>((set, get) => ({
  view: 'home',
  games: [],
  installers: [],
  roots: [],
  selectedGameId: null,
  scanning: false,
  progress: null,
  lastSummary: null,
  error: null,

  setView: (view) => set({ view }),
  select: (selectedGameId) => set({ selectedGameId }),

  refresh: async () => {
    const [games, installers] = await Promise.all([window.api.library.list(), window.api.installers.list()])
    set({ games, installers })
  },

  refreshRoots: async () => set({ roots: await window.api.roots.list() }),

  startScan: async () => {
    if (get().scanning) return
    set({ scanning: true, progress: null, error: null })
    await window.api.scan.start()
  },

  cancelScan: async () => window.api.scan.cancel(),
  dismissError: () => set({ error: null }),
  setError: (message) => set({ error: message })
}))

/** Wires main-process scan events into the store. Call once at startup. */
export function connectScanEvents(): () => void {
  const offProgress = window.api.scan.onProgress((progress) => useLauncher.setState({ scanning: true, progress }))
  const offFinished = window.api.scan.onFinished(async ({ summary, error }) => {
    useLauncher.setState({ scanning: false, progress: null, lastSummary: summary, error })
    await Promise.all([useLauncher.getState().refresh(), useLauncher.getState().refreshRoots()])
  })
  return () => {
    offProgress()
    offFinished()
  }
}
