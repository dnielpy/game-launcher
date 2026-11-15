/** The Orus mark: an open ring with a point in its gap and an eye in the middle. Same drawing as resources/mark.svg. */
export function OrusMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <defs>
        <linearGradient id="orus-ring" x1="0.15" y1="0.1" x2="0.85" y2="0.95">
          <stop offset="0" stopColor="#7CF27C" />
          <stop offset="0.55" stopColor="#3FBF3F" />
          <stop offset="1" stopColor="#0E6E0E" />
        </linearGradient>
      </defs>
      <path d="M 357.8 154.2 A 144 144 0 1 0 400 256" fill="none" stroke="url(#orus-ring)" strokeWidth="56" strokeLinecap="round" />
      <circle cx="256" cy="256" r="40" fill="#F3F4F5" />
      <circle cx="389" cy="201" r="24" fill="#F3F4F5" />
    </svg>
  )
}
