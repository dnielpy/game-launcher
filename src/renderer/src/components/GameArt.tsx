import { useState } from 'react'
import type { Game } from '@shared/types'
import { coverUrl, heroUrl, titleHue } from '../format'

/** Placeholder until a cover arrives: a color field derived from the title, with the title set in type. */
function Placeholder({ game, large }: { game: Game; large: boolean }) {
  const hue = titleHue(game.title)
  const loading = game.metadataStatus === 'pending'
  return (
    <div
      className="absolute inset-0 flex items-end p-3"
      style={{ background: `linear-gradient(160deg, hsl(${hue} 38% 30%) 0%, hsl(${(hue + 50) % 360} 45% 12%) 100%)` }}
    >
      {loading && <div className="absolute inset-0 animate-pulse bg-white/5" />}
      <span className={`relative font-display font-semibold leading-tight text-white/90 ${large ? 'text-4xl' : 'line-clamp-4 text-lg'}`}>
        {game.title}
      </span>
    </div>
  )
}

/** Vertical box art (2:3). Falls back to the placeholder when the image is missing or fails to load. */
export function Cover({ game, large = false }: { game: Game; large?: boolean }) {
  const url = coverUrl(game)
  const [failed, setFailed] = useState<string | null>(null)
  const showImage = url !== null && failed !== url
  return (
    <div className="relative h-full w-full overflow-hidden bg-surface">
      {showImage ? (
        <img src={url} alt="" draggable={false} onError={() => setFailed(url)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <Placeholder game={game} large={large} />
      )}
    </div>
  )
}

/** Wide banner art. Falls back to a soft color field. */
/** Pass the positioning in className ("absolute inset-0"); without it the banner is positioned relative. */
export function Hero({ game, className = 'relative' }: { game: Game; className?: string }) {
  const url = heroUrl(game)
  const [failed, setFailed] = useState<string | null>(null)
  const hue = titleHue(game.title)
  return (
    <div className={`overflow-hidden ${className}`}>
      {url && failed !== url ? (
        <img src={url} alt="" draggable={false} onError={() => setFailed(url)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(120% 120% at 80% 20%, hsl(${hue} 40% 28%) 0%, hsl(${(hue + 40) % 360} 40% 10%) 60%, #16181b 100%)` }}
        />
      )}
    </div>
  )
}
