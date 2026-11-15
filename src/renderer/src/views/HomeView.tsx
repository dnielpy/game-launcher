import type { Game } from '@shared/types'
import { GameArt } from '../components/GameArt'
import { GameTile } from '../components/GameTile'
import { useLauncher } from '../store'

function Row({ title, games }: { title: string; games: Game[] }) {
  if (games.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="grid auto-cols-[150px] grid-flow-col gap-4 overflow-x-auto pb-3">
        {games.map((game) => (
          <GameTile key={game.id} game={game} />
        ))}
      </div>
    </section>
  )
}

export function HomeView() {
  const { games, scanning, select, startScan } = useLauncher()
  const visible = games.filter((game) => !game.hidden && game.status === 'installed')

  if (visible.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <h1 className="font-display text-4xl font-semibold">{scanning ? 'Looking for your games' : 'Your library is empty'}</h1>
        <p className="max-w-md text-muted">
          {scanning
            ? 'The first scan checks every drive. Games show up here as soon as it finishes.'
            : 'Scan your PC to find installed games, or add the folders where you keep them under Locations.'}
        </p>
        {!scanning && (
          <button type="button" onClick={() => void startScan()} className="mt-2 rounded-md bg-accent px-6 py-2.5 font-semibold text-white hover:bg-accent-bright hover:text-black">
            Scan for games
          </button>
        )}
      </div>
    )
  }

  const recentlyAdded = [...visible].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 12)
  const favorites = visible.filter((game) => game.favorite)
  const needsReview = visible.filter((game) => game.needsReview)
  const featured = favorites[0] ?? recentlyAdded[0]!

  return (
    <div className="flex flex-col gap-10 pb-10">
      <button
        type="button"
        onClick={() => select(featured.id)}
        className="relative h-[340px] w-full overflow-hidden rounded-lg text-left"
      >
        <GameArt game={featured} size="hero" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/35 to-transparent" />
        <div className="absolute bottom-10 left-10 flex max-w-xl flex-col gap-4">
          <h1 className="font-display text-5xl font-semibold leading-[1.05]">{featured.title}</h1>
          <span className="w-fit rounded-md bg-ink px-6 py-2.5 text-sm font-semibold text-canvas">View game</span>
        </div>
      </button>

      <Row title="Recently added" games={recentlyAdded} />
      <Row title="Favorites" games={favorites} />
      <Row title="Need your check" games={needsReview} />
    </div>
  )
}
