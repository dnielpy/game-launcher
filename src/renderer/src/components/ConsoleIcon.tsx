/** A generic handheld console: screen in the middle, controls on both sides. Marks console games and the console list. */
export const HANDHELD_ICON = 'M6 6h12a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4zM8 9h8v6H8zM4.8 12h.01M19.2 10.8h.01M19.2 13.2h.01'

export function ConsoleIcon({ className = 'h-4 w-4', label }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={HANDHELD_ICON} />
    </svg>
  )
}
