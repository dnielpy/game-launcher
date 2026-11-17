import type { ProfileState } from '@shared/types'
import { titleHue } from '../format'

export function avatarUrl(profile: ProfileState | null): string | null {
  return profile?.avatarFile ? `media://profile/${encodeURIComponent(profile.avatarFile)}` : null
}

/** Round profile picture: the photo, else the first letter of the name, else a plain silhouette. */
export function Avatar({ profile, className = 'h-10 w-10', textClass = 'text-base' }: { profile: ProfileState | null; className?: string; textClass?: string }) {
  const url = avatarUrl(profile)
  const name = profile?.created ? profile.name : ''
  const hue = titleHue(name || 'orus')
  return (
    <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`} style={url ? undefined : { background: name ? `hsl(${hue} 40% 32%)` : 'var(--color-raised)' }}>
      {url ? (
        <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      ) : name ? (
        <span className={`font-display font-semibold uppercase text-white ${textClass}`}>{name.trim().charAt(0)}</span>
      ) : (
        <svg viewBox="0 0 24 24" className="h-1/2 w-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
        </svg>
      )}
    </span>
  )
}
