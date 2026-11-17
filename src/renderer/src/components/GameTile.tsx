import type { Game } from '@shared/types'
import { formatHoursShort } from '../format'
import { useLauncher } from '../store'
import { Cover } from './GameArt'

export function GameTile({ game, showPlaytime = false }: { game: Game; showPlaytime?: boolean }) {
  const select = useLauncher((state) => state.select)
  const running = useLauncher((state) => state.runningGameIds.includes(game.id))
  const dimmed = game.status !== 'installed'

  return (
    <button type="button" onClick={() => select(game.id)} className="group flex w-full flex-col text-left" title={game.title}>
      <div
        className={`relative aspect-[2/3] w-full overflow-hidden rounded-md ring-accent-bright transition-[box-shadow,transform] duration-150 group-hover:scale-[1.03] group-hover:ring-2 group-focus-visible:ring-2 ${dimmed ? 'opacity-60 grayscale' : ''}`}
      >
        <Cover game={game} />
        {running && <span className="absolute left-2 top-2 rounded-sm bg-accent-bright px-1.5 py-0.5 text-[11px] font-semibold text-black">Playing</span>}
        {!running && game.needsReview && (
          <span className="absolute left-2 top-2 rounded-sm bg-warn px-1.5 py-0.5 text-[11px] font-semibold text-black">Check exe</span>
        )}
        {game.favorite && (
          <span className="absolute right-2 top-2 text-sm text-white drop-shadow" aria-label="Favorite">
            ★
          </span>
        )}
      </div>
      <span className="mt-2 line-clamp-2 text-sm leading-snug text-ink">{game.title}</span>
      {dimmed ? (
        <span className="text-xs text-muted">{game.status === 'missing' ? 'Not installed' : 'Drive disconnected'}{game.playtimeSeconds > 0 ? `, ${formatHoursShort(game.playtimeSeconds)} played` : ''}</span>
      ) : (
        showPlaytime && game.playtimeSeconds > 0 && <span className="text-xs text-muted">{formatHoursShort(game.playtimeSeconds)} played</span>
      )}
    </button>
  )
}
