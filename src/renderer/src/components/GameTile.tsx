import type { Game } from '@shared/types'
import { formatHoursShort } from '../format'
import { useLauncher } from '../store'
import switchBadge from '../assets/switch-badge.png'
import { Cover } from './GameArt'

export function GameTile({ game, showPlaytime = false }: { game: Game; showPlaytime?: boolean }) {
  const select = useLauncher((state) => state.select)
  const running = useLauncher((state) => state.runningGameIds.includes(game.id))
  // Games that are not on disk keep their cover as it is; the line under the title says they are not installed.
  const notInstalled = game.status !== 'installed'

  return (
    <button type="button" onClick={() => select(game.id)} className="game-tile group flex w-full flex-col text-left" title={game.title}>
      <div
        className="game-tile-cover relative aspect-[2/3] w-full overflow-hidden rounded-md ring-accent-bright transition-[box-shadow,transform] duration-150 group-hover:scale-[1.03] group-hover:ring-2 group-focus-visible:ring-2"
      >
        <Cover game={game} />
        {running && <span className="absolute left-2 top-2 rounded-sm bg-accent-bright px-1.5 py-0.5 text-[11px] font-semibold text-black">Playing</span>}
        {!running && game.needsReview && (
          <span className="absolute left-2 top-2 rounded-sm bg-warn px-1.5 py-0.5 text-[11px] font-semibold text-black">Check exe</span>
        )}
        {!running && !game.needsReview && game.platform === 'switch' && (
          <img src={switchBadge} alt="Nintendo Switch" title="Nintendo Switch" draggable={false} className="absolute left-2 top-2 h-7 w-7 rounded-md shadow-[0_2px_8px_rgba(0,0,0,0.45)]" />
        )}
        {game.favorite && (
          <span className="absolute right-2 top-2 text-sm text-white drop-shadow" aria-label="Favorite">
            ★
          </span>
        )}
      </div>
      <span className="mt-2 line-clamp-2 text-sm leading-snug text-ink">{game.title}</span>
      {notInstalled ? (
        <span className="text-xs text-muted">{game.status === 'missing' ? 'Not installed' : 'Drive disconnected'}{game.playtimeSeconds > 0 ? `, ${formatHoursShort(game.playtimeSeconds)} played` : ''}</span>
      ) : (
        showPlaytime && game.playtimeSeconds > 0 && <span className="text-xs text-muted">{formatHoursShort(game.playtimeSeconds)} played</span>
      )}
    </button>
  )
}
