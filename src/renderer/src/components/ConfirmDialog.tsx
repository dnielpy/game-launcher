import { useEffect, useRef } from 'react'
import { useLauncher } from '../store'

/** The one confirmation dialog of the app, driven by useLauncher().confirm(). */
export function ConfirmDialog() {
  const request = useLauncher((state) => state.confirmRequest)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!request) return
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        request.resolve(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [request])

  if (!request) return null
  return (
    <div data-gamepad-scope="60" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6 backdrop-blur-[2px] motion-safe:animate-[fade-in_150ms_ease-out]" onClick={() => request.resolve(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-surface p-6 shadow-[0_30px_100px_rgba(0,0,0,0.5)] motion-safe:animate-[pop-in_180ms_cubic-bezier(.2,.9,.3,1.2)]"
      >
        <h2 id="confirm-title" className="font-display text-xl font-semibold">
          {request.title}
        </h2>
        <p className="mt-2 whitespace-pre-line text-sm text-muted">{request.message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button data-gamepad-back data-gamepad-autofocus ref={cancelRef} type="button" onClick={() => request.resolve(false)} className="rounded-md bg-raised px-5 py-2 text-sm hover:bg-line">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => request.resolve(true)}
            className={`rounded-md px-5 py-2 text-sm font-semibold ${request.danger ? 'bg-danger text-white hover:brightness-110' : 'bg-accent text-white hover:bg-accent-bright hover:text-black'}`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
