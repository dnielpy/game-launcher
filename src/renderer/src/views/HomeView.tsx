import { useRef } from 'react'
import type { Game } from '@shared/types'
import { Hero } from '../components/GameArt'
import { GameTile } from '../components/GameTile'
import { formatPlaytime, logoUrl, releaseYear } from '../format'
import { errorMessage, useLauncher } from '../store'

function Row({ title, games, showPlaytime = false }: { title: string; games: Game[]; showPlaytime?: boolean }) {
  if (games.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {/* Padding inside the scroller leaves room for the hover ring and zoom, which overflow clipping would cut. */}
      <div className="-mx-3 grid auto-cols-[160px] grid-flow-col gap-4 overflow-x-auto px-3 pb-3 pt-2">
        {games.map((game) => (
          <GameTile key={game.id} game={game} showPlaytime={showPlaytime} />
        ))}
      </div>
    </section>
  )
}

function Featured({ game }: { game: Game }) {
  const { select, setError, runningGameIds } = useLauncher()
  const logo = logoUrl(game)
  const running = runningGameIds.includes(game.id)
  const facts = [game.metadata?.genres.slice(0, 2).join(', '), releaseYear(game), game.playtimeSeconds > 0 ? `${formatPlaytime(game.playtimeSeconds)} played` : null].filter(Boolean)

  async function play() {
    try {
      await window.api.library.launch(game.id)
    } catch (error) {
      setError(errorMessage(error))
    }
  }

  return (
    <section className="relative h-[440px] overflow-hidden rounded-xl">
      <Hero game={game} className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <div className="absolute bottom-10 left-10 flex max-w-xl flex-col gap-5">
        {logo ? (
          <img src={logo} alt={game.title} className="max-h-32 max-w-[440px] object-contain object-left drop-shadow-[0_4px_18px_rgba(0,0,0,0.7)]" />
        ) : (
          <h1 className="font-display text-5xl font-semibold leading-[1.05]">{game.title}</h1>
        )}
        {facts.length > 0 && (
          <p className="flex gap-5 text-sm text-white/75">
            {facts.map((fact) => (
              <span key={fact}>{fact}</span>
            ))}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            disabled={running || game.launch === null}
            onClick={() => void play()}
            className="rounded-md bg-accent px-8 py-3 font-semibold text-white enabled:hover:bg-accent-bright enabled:hover:text-black disabled:opacity-60"
          >
            {running ? 'Playing now' : game.lastPlayedAt ? 'Continue playing' : 'Play'}
          </button>
          <button type="button" onClick={() => select(game.id)} className="rounded-md bg-white/15 px-6 py-3 font-semibold backdrop-blur hover:bg-white/25">
            Details
          </button>
        </div>
      </div>
    </section>
  )
}

export function HomeView() {
  const { games, scanning, startScan, loaded } = useLauncher()
  const visible = games.filter((game) => game.category === 'game' && !game.hidden && game.status === 'installed')
  // Nothing played yet: any game, preferring ones with a banner. Picked once and kept while it stays in the library.
  const pickedId = useRef<number | null>(null)
  const pool = visible.filter((game) => game.metadata?.heroFile)
  const candidates = pool.length > 0 ? pool : visible
  if (candidates.length > 0 && !candidates.some((game) => game.id === pickedId.current)) {
    pickedId.current = candidates[Math.floor(Math.random() * candidates.length)]!.id
  }
  const randomPick = candidates.find((game) => game.id === pickedId.current)

  if (visible.length === 0) {
    if (!loaded) return null
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <h1 className="font-display text-4xl font-semibold">{scanning ? 'Looking for your games' : 'Your library is empty'}</h1>
        <p className="max-w-md text-muted">
          {scanning ? 'Games show up here as soon as the scan finishes.' : 'Scan your PC to find installed games, or add the folders where you keep them under Locations.'}
        </p>
        {!scanning && (
          <button type="button" onClick={() => void startScan(true)} className="mt-2 rounded-md bg-accent px-6 py-2.5 font-semibold text-white hover:bg-accent-bright hover:text-black">
            Scan for games
          </button>
        )}
      </div>
    )
  }

  const recentlyPlayed = visible.filter((game) => game.lastPlayedAt).sort((a, b) => b.lastPlayedAt!.localeCompare(a.lastPlayedAt!))
  const recentlyAdded = [...visible].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 14)
  const favorites = visible.filter((game) => game.favorite)
  const mostPlayed = visible.filter((game) => game.playtimeSeconds > 0).sort((a, b) => b.playtimeSeconds - a.playtimeSeconds).slice(0, 14)
  const featured = recentlyPlayed[0] ?? randomPick ?? visible[0]!

  return (
    <div className="flex flex-col gap-10 pb-10">
      <Featured game={featured} />
      <Row title="Jump back in" games={recentlyPlayed.slice(0, 14)} showPlaytime />
      <Row title="Favorites" games={favorites} />
      <Row title="Recently added" games={recentlyAdded} />
      <Row title="Most played" games={mostPlayed} showPlaytime />
    </div>
  )
}
