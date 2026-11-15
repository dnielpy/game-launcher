import type { Game } from '@shared/types'
import { useLauncher } from '../store'
import { GameArt } from './GameArt'

export function GameTile({ game }: { game: Game }) {
  const select = useLauncher((state) => state.select)
  const dimmed = game.status !== 'installed'

  return (
    <button
      type="button"
      onClick={() => select(game.id)}
      className="group flex w-full flex-col text-left"
      title={game.installPath}
    >
      <div
        className={`relative aspect-square w-full overflow-hidden rounded-md ring-0 ring-accent-bright transition-[box-shadow,transform] duration-150 group-hover:scale-[1.03] group-hover:ring-2 group-focus-visible:ring-2 ${dimmed ? 'opacity-40 grayscale' : ''}`}
      >
        <GameArt game={game} />
        {game.needsReview && (
          <span className="absolute left-2 top-2 rounded-sm bg-warn px-1.5 py-0.5 text-[11px] font-semibold text-black">Check exe</span>
        )}
        {game.favorite && <span className="absolute right-2 top-2 text-sm" aria-label="Favorite">★</span>}
      </div>
      <span className="mt-2 line-clamp-2 text-sm leading-snug text-ink">{game.title}</span>
      {dimmed && <span className="text-xs text-muted">{game.status === 'missing' ? 'Not found on disk' : 'Drive disconnected'}</span>}
    </button>
  )
}
