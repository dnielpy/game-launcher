import { create } from 'zustand'
import type { AppState, Game, LibraryRoot, MetadataProgress, PendingInstaller, ProfileState, ScanProgress, ScanSummary, SettingsState, SkinId, UpdateStatus } from '@shared/types'

export type View = 'home' | 'library' | 'emulators' | 'tools' | 'settings'
export type SettingsModule = 'appearance' | 'updates' | 'locations' | 'emulation' | 'covers' | 'data' | 'about'

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  resolve: (confirmed: boolean) => void
}

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
  profile: ProfileState | null
  profileOpen: boolean
  skin: SkinId
  settings: SettingsState | null
  /** Null until loaded from the main process. */
  app: AppState | null
  online: boolean
  /** Set while everything is being backed up and deleted. */
  resetting: 'saving' | 'restarting' | null
  confirmRequest: ConfirmRequest | null
  /** Shows a confirmation dialog; resolves true when the user agrees. */
  confirm: (request: Omit<ConfirmRequest, 'resolve'>) => Promise<boolean>
  setSkin: (skin: SkinId) => Promise<void>
  setSettings: (settings: SettingsState) => void
  error: string | null
  loaded: boolean
  /** Settings module open right now; null shows the list of modules. */
  settingsModule: SettingsModule | null
  setView: (view: View) => void
  setProfile: (profile: ProfileState) => void
  openProfile: (open: boolean) => void
  openSettings: (module: SettingsModule | null) => void
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
  profile: null,
  profileOpen: false,
  skin: 'cinema',
  settings: null,
  app: null,
  resetting: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  confirmRequest: null,
  confirm: (request) =>
    new Promise<boolean>((resolve) =>
      set({
        confirmRequest: {
          ...request,
          resolve: (confirmed) => {
            set({ confirmRequest: null })
            resolve(confirmed)
          }
        }
      })
    ),
  setSkin: async (skin) => {
    applySkin(skin)
    set({ skin })
    const settings = await window.api.settings.setSkin(skin)
    set({ settings })
  },
  setSettings: (settings) => {
    applySkin(settings.skin)
    set({ settings, skin: settings.skin })
  },
  error: null,
  loaded: false,

  settingsModule: null,
  // Going to a section from the sidebar always starts at its top level.
  setView: (view) => set({ view, settingsModule: null }),
  setProfile: (profile) => set({ profile }),
  openProfile: (profileOpen) => set({ profileOpen }),
  openSettings: (settingsModule) => set({ view: 'settings', settingsModule }),
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

/** The skin is a data attribute on <html>: colors, type and shapes switch in CSS, the layout in App. */
export function applySkin(skin: SkinId): void {
  document.documentElement.dataset['skin'] = skin
}

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
  void window.api.profile.get().then((profile) => useLauncher.setState({ profile }))
  void window.api.settings.get().then((settings) => useLauncher.getState().setSettings(settings))
  void window.api.app.state().then((app) => useLauncher.setState({ app }))
  const offFullscreen = window.api.window.onFullscreenChanged((fullscreen) => {
    const app = useLauncher.getState().app
    if (app) useLauncher.setState({ app: { ...app, fullscreen } })
  })
  const checkOnline = () => void window.api.app.isOnline().then((online) => useLauncher.setState({ online: online && navigator.onLine }))
  checkOnline()
  window.addEventListener('online', checkOnline)
  window.addEventListener('offline', checkOnline)
  return () => {
    offFullscreen()
    window.removeEventListener('online', checkOnline)
    window.removeEventListener('offline', checkOnline)
    offUpdates()
    offProgress()
    offFinished()
    offMetadata()
    offChanged()
  }
}
