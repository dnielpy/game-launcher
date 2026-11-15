import { useMemo, useState } from 'react'
import { GameTile } from '../components/GameTile'
import { useLauncher } from '../store'

type Filter = 'all' | 'favorites' | 'review' | 'missing' | 'hidden'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All games' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'review', label: 'Need your check' },
  { id: 'missing', label: 'Not found' },
  { id: 'hidden', label: 'Hidden' }
]

type Sort = 'name' | 'played' | 'playtime' | 'added' | 'size'

export function LibraryView() {
  const games = useLauncher((state) => state.games)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('name')

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return games
      .filter((game) => game.category === 'game')
      .filter((game) => {
        if (filter === 'hidden') return game.hidden
        if (game.hidden) return false
        if (filter === 'favorites') return game.favorite
        if (filter === 'review') return game.needsReview
        if (filter === 'missing') return game.status !== 'installed'
        return true
      })
      .filter((game) => needle.length === 0 || game.title.toLowerCase().includes(needle))
      .sort((a, b) => {
        if (sort === 'added') return b.addedAt.localeCompare(a.addedAt)
        if (sort === 'played') return (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '') || a.title.localeCompare(b.title)
        if (sort === 'playtime') return b.playtimeSeconds - a.playtimeSeconds || a.title.localeCompare(b.title)
        if (sort === 'size') return b.sizeBytes - a.sizeBytes
        return a.title.localeCompare(b.title)
      })
  }, [games, query, filter, sort])

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold">My library</h1>
        <div className="flex items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your games"
            className="w-64 rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted/70 focus:border-accent-bright"
          />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none"
            aria-label="Sort by"
          >
            <option value="name">Name</option>
            <option value="played">Recently played</option>
            <option value="playtime">Time played</option>
            <option value="added">Recently added</option>
            <option value="size">Size on disk</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`rounded-full px-4 py-1.5 text-sm ${filter === item.id ? 'bg-ink text-canvas' : 'bg-surface text-muted hover:text-ink'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-muted">No games match this view.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-4 gap-y-6">
          {visible.map((game) => (
            <GameTile key={game.id} game={game} showPlaytime={sort === 'played' || sort === 'playtime'} />
          ))}
        </div>
      )}
    </div>
  )
}
