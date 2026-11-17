import { useLauncher } from '../store'

/** Minimize, leave full screen and close. Only shown in full screen, where Windows draws no title bar. */
export function WindowControls() {
  const fullscreen = useLauncher((state) => state.app?.fullscreen === true)
  if (!fullscreen) return null
  const button = 'flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-raised hover:text-ink'
  return (
    <div className="flex items-center gap-1 border-l border-line pl-3">
      <button type="button" onClick={() => void window.api.window.minimize()} className={button} aria-label="Minimize" title="Minimize">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <path d="M5 12h14" />
        </svg>
      </button>
      <button type="button" onClick={() => void window.api.window.toggleFullscreen()} className={button} aria-label="Leave full screen" title="Leave full screen (F11)">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        </svg>
      </button>
      <button type="button" onClick={() => void window.api.window.close()} className={`${button} hover:!bg-danger hover:!text-white`} aria-label="Close Orus" title="Close Orus">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}
