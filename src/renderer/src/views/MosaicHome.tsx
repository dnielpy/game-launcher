import type { CSSProperties, ReactNode } from 'react'
import type { Game } from '@shared/types'
import { computeProfileStats, formatTotalHours } from '@shared/profileStats'
import { Cover, Hero } from '../components/GameArt'
import { formatHoursShort, formatRelative, logoUrl, releaseYear } from '../format'
import { useLauncher } from '../store'
import { EmptyHome } from './HomeView'
import { playGame, useHomeData } from './homeData'

/** Tiles come in one after another. */
function delay(index: number): CSSProperties {
  return { animationDelay: `${Math.min(index, 14) * 45}ms` }
}

const tileBase = 'group relative overflow-hidden rounded-xl bg-surface text-left shadow-[0_1px_2px_rgba(16,18,24,0.08)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-[0_14px_34px_rgba(16,18,24,0.16)] focus-visible:-translate-y-1'

function FeaturedTile({ game, style }: { game: Game; style: CSSProperties }) {
  const { select, runningGameIds } = useLauncher()
  const logo = logoUrl(game)
  const running = runningGameIds.includes(game.id)
  return (
    <div className={`${tileBase} col-span-4 row-span-3`} style={style}>
      <button type="button" onClick={() => select(game.id)} className="absolute inset-0" aria-label={`${game.title} details`}>
        <Hero game={game} className="absolute inset-0 transition-transform duration-700 group-hover:scale-[1.03]" />
      </button>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="pointer-events-none absolute bottom-7 left-7 right-7 flex items-end justify-between gap-6 text-white">
        <div className="min-w-0">
          <div className="mb-2 inline-block rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider backdrop-blur">
            {game.lastPlayedAt ? 'Continue' : 'Featured'}
          </div>
          {logo ? (
            <img src={logo} alt={game.title} className="max-h-24 max-w-[380px] object-contain object-left drop-shadow-lg" />
          ) : (
            <h2 className="font-display text-4xl font-bold leading-tight">{game.title}</h2>
          )}
          <p className="mt-2 text-sm text-white/75">
            {[game.metadata?.genres[0], releaseYear(game), game.playtimeSeconds > 0 ? `${formatHoursShort(game.playtimeSeconds)} played` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button
          type="button"
          disabled={running || game.launch === null}
          onClick={() => void playGame(game)}
          className="pointer-events-auto shrink-0 rounded-lg bg-white px-7 py-3 font-semibold text-black transition-transform enabled:hover:scale-105 enabled:active:scale-95 disabled:opacity-60"
        >
          {running ? 'Playing' : 'Play'}
        </button>
      </div>
    </div>
  )
}

function StatsTile({ games, style }: { games: Game[]; style: CSSProperties }) {
  const openProfile = useLauncher((state) => state.openProfile)
  const stats = computeProfileStats(games, 3)
  const top = stats.ranking[0]?.playtimeSeconds ?? 1
  return (
    <button
      type="button"
      onClick={() => openProfile(true)}
      className={`${tileBase} col-span-2 row-span-3 flex flex-col bg-gradient-to-br from-accent to-[#2a2a8f] p-6 text-white`}
      style={style}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-white/70">Your playtime</span>
      <span className="mt-1 font-display text-5xl font-bold leading-none">{formatTotalHours(stats.totalSeconds)}</span>
      <span className="mt-2 text-sm text-white/75">
        {stats.gamesPlayed} {stats.gamesPlayed === 1 ? 'game' : 'games'} · {stats.sessions} sessions
      </span>
      <ol className="mt-auto flex flex-col gap-2.5">
        {stats.ranking.map((game, index) => (
          <li key={game.id} className="flex flex-col gap-1">
            <span className="flex justify-between gap-3 text-sm">
              <span className="truncate">
                {index + 1}. {game.title}
              </span>
              <span className="shrink-0 text-white/70">{formatHoursShort(game.playtimeSeconds)}</span>
            </span>
            <span className="h-1 overflow-hidden rounded-full bg-white/20">
              <span className="block h-full rounded-full bg-white transition-[width] duration-700" style={{ width: `${Math.max(4, (game.playtimeSeconds / top) * 100)}%` }} />
            </span>
          </li>
        ))}
        {stats.ranking.length === 0 && <li className="text-sm text-white/70">Play something and your top games show up here.</li>}
      </ol>
    </button>
  )
}

function WideTile({ game, style }: { game: Game; style: CSSProperties }) {
  const select = useLauncher((state) => state.select)
  return (
    <button type="button" onClick={() => select(game.id)} className={`${tileBase} col-span-2 row-span-1 flex`} style={style}>
      <span className="relative h-full w-[38%] shrink-0 overflow-hidden">
        <Hero game={game} className="absolute inset-0 transition-transform duration-500 group-hover:scale-105" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-4">
        <span className="truncate font-semibold">{game.title}</span>
        <span className="text-xs text-muted">
          {formatHoursShort(game.playtimeSeconds)} · {formatRelative(game.lastPlayedAt)}
        </span>
      </span>
    </button>
  )
}

function CoverTile({ game, style }: { game: Game; style: CSSProperties }) {
  const select = useLauncher((state) => state.select)
  return (
    <button type="button" onClick={() => select(game.id)} className={`${tileBase} flex flex-col`} style={style} title={game.title}>
      <span className="block aspect-[2/3] w-full overflow-hidden">
        <span className="block h-full w-full transition-transform duration-500 group-hover:scale-105">
          <Cover game={game} />
        </span>
      </span>
      <span className="truncate px-3 py-2.5 text-sm font-semibold">{game.title}</span>
    </button>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

/** Mosaic Home: tiles of different sizes, light and airy. */
export function MosaicHome() {
  const { games, loaded } = useLauncher()
  const data = useHomeData()
  if (data.visible.length === 0) return loaded ? <div className="h-[70vh]"><EmptyHome /></div> : null

  const featured = data.recentlyPlayed[0] ?? data.visible.find((game) => game.metadata?.heroFile) ?? data.visible[0]!
  const continueTiles = data.recentlyPlayed.filter((game) => game.id !== featured.id).slice(0, 3)
  const favorites = data.favorites.slice(0, 12)
  const added = data.recentlyAdded.slice(0, 12)
  let order = 0

  return (
    <div className="flex flex-col gap-9">
      <div className="stagger grid grid-cols-6 auto-rows-[104px] gap-4">
        <FeaturedTile game={featured} style={delay(order++)} />
        <StatsTile games={games} style={delay(order++)} />
        {continueTiles.map((game) => (
          <WideTile key={game.id} game={game} style={delay(order++)} />
        ))}
      </div>

      {favorites.length > 0 && (
        <Section title="Favorites">
          <div className="stagger grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
            {favorites.map((game, index) => (
              <CoverTile key={game.id} game={game} style={delay(index)} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Recently added">
        <div className="stagger grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
          {added.map((game, index) => (
            <CoverTile key={game.id} game={game} style={delay(index)} />
          ))}
        </div>
      </Section>
    </div>
  )
}
