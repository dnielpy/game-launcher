import type { Game } from '@shared/types'
import { iconUrl, titleHue } from '../format'

/**
 * Placeholder art until metadata arrives: a color field derived from the title
 * with the exe icon on top. Cover images from RAWG replace this in phase 3.
 */
export function GameArt({ game, size = 'tile' }: { game: Game; size?: 'tile' | 'hero' }) {
  const hue = titleHue(game.title)
  const icon = iconUrl(game.iconPath)
  const background = `linear-gradient(150deg, hsl(${hue} 45% 30%) 0%, hsl(${(hue + 40) % 360} 50% 14%) 100%)`

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background }}>
      {icon ? (
        <img
          src={icon}
          alt=""
          draggable={false}
          className={size === 'hero' ? 'absolute right-[8%] top-1/2 h-40 w-40 -translate-y-1/2 opacity-90' : 'absolute inset-0 m-auto h-16 w-16'}
          style={{ imageRendering: 'auto' }}
        />
      ) : (
        <span
          className={`absolute inset-0 flex items-center justify-center font-display font-semibold text-white/80 ${size === 'hero' ? 'text-8xl' : 'text-4xl'}`}
        >
          {game.title.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  )
}
