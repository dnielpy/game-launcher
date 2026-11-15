import { useEffect, useRef, useState } from 'react'
import type { Game, GamePatch, MetadataCandidate } from '@shared/types'
import { fileName, formatBytes, formatPlaytime, formatRelative, logoUrl, mediaUrl } from '../format'
import { errorMessage, useLauncher } from '../store'
import { Cover, Hero } from './GameArt'

type Tab = 'about' | 'manage'

const SOURCE_LABELS: Record<string, string> = {
  folder: 'a games folder',
  registry: 'installed programs',
  shortcut: 'a desktop or Start menu shortcut',
  steam: 'Steam',
  epic: 'Epic Games'
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-display text-2xl font-semibold leading-none">{value}</div>
      <div className="mt-1.5 text-xs text-muted">{detail ? `${label}, ${detail}` : label}</div>
    </div>
  )
}

function PlayButton({ game }: { game: Game }) {
  const { runningGameIds, setError } = useLauncher()
  const [starting, setStarting] = useState(false)
  const running = runningGameIds.includes(game.id)
  const canPlay = game.status === 'installed' && game.launch !== null && !running

  async function play() {
    setStarting(true)
    try {
      await window.api.library.launch(game.id)
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setTimeout(() => setStarting(false), 2500)
    }
  }

  return (
    <button
      type="button"
      disabled={!canPlay || starting}
      onClick={() => void play()}
      className="flex items-center gap-2 rounded-md bg-accent px-9 py-3 font-semibold text-white enabled:hover:bg-accent-bright enabled:hover:text-black disabled:opacity-50"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
        <path d="M7 4.5v15l12.5-7.5z" />
      </svg>
      {running ? 'Playing now' : starting ? 'Starting' : game.status !== 'installed' ? 'Not available' : 'Play'}
    </button>
  )
}

function AboutTab({ game }: { game: Game }) {
  const metadata = game.metadata
  const [expanded, setExpanded] = useState(false)
  const [zoomed, setZoomed] = useState<string | null>(null)
  const description = metadata?.description ?? null
  const long = (description?.length ?? 0) > 700

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_260px] gap-10">
      <div className="flex min-w-0 flex-col gap-6">
        {metadata?.shortDescription && <p className="text-[17px] leading-relaxed text-ink">{metadata.shortDescription}</p>}
        {description && (
          <div>
            <p className={`whitespace-pre-line text-sm leading-relaxed text-muted ${long && !expanded ? 'line-clamp-[10]' : ''}`}>{description}</p>
            {long && (
              <button type="button" onClick={() => setExpanded(!expanded)} className="mt-2 text-sm font-semibold text-accent-bright hover:underline">
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        )}
        {!metadata && (
          <p className="rounded-md bg-canvas px-4 py-3 text-sm text-muted">
            {game.metadataStatus === 'pending'
              ? 'Looking for this game’s cover and details.'
              : 'No details found for this game. Open Manage to search for it by name.'}
          </p>
        )}
        {metadata && metadata.screenshotFiles.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {metadata.screenshotFiles.map((file) => {
              const url = mediaUrl(game, file)!
              return (
                <button key={file} type="button" onClick={() => setZoomed(url)} className="overflow-hidden rounded-md">
                  <img src={url} alt="" className="aspect-video w-full object-cover transition-transform hover:scale-[1.03]" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      <dl className="flex flex-col gap-4 text-sm">
        {metadata?.releaseDate && (
          <div>
            <dt className="text-muted">Release date</dt>
            <dd>{metadata.releaseDate}</dd>
          </div>
        )}
        {metadata && metadata.genres.length > 0 && (
          <div>
            <dt className="text-muted">Genres</dt>
            <dd>{metadata.genres.join(', ')}</dd>
          </div>
        )}
        {metadata && metadata.developers.length > 0 && (
          <div>
            <dt className="text-muted">Developer</dt>
            <dd>{metadata.developers.join(', ')}</dd>
          </div>
        )}
        {metadata && metadata.publishers.length > 0 && (
          <div>
            <dt className="text-muted">Publisher</dt>
            <dd>{metadata.publishers.join(', ')}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted">Size on disk</dt>
          <dd>{formatBytes(game.sizeBytes)}</dd>
        </div>
        <div>
          <dt className="text-muted">Installed in</dt>
          <dd className="break-all">{game.installPath}</dd>
        </div>
        {metadata?.storeUrl && (
          <button
            type="button"
            onClick={() => void window.api.openExternal(metadata.storeUrl!)}
            className="self-start text-left text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Details and images from {metadata.source === 'steam' ? 'the Steam store' : 'RAWG'}
          </button>
        )}
      </dl>

      {zoomed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-10" onClick={() => setZoomed(null)}>
          <img src={zoomed} alt="" className="max-h-full max-w-full rounded-md" />
        </div>
      )}
    </div>
  )
}

function MatchSearch({ game, onDone }: { game: Game; onDone: () => void }) {
  const { refresh, setError } = useLauncher()
  const [query, setQuery] = useState(game.metadata?.name ?? game.searchTitle)
  const [results, setResults] = useState<MetadataCandidate[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function search() {
    setBusy('search')
    try {
      setResults(await window.api.metadata.search(query))
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function choose(candidate: MetadataCandidate) {
    setBusy(`${candidate.source}:${candidate.externalId}`)
    try {
      await window.api.metadata.assign(game.id, candidate.source, candidate.externalId)
      await refresh()
      onDone()
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Game name"
          className="flex-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-bright"
        />
        <button type="submit" disabled={busy !== null || query.trim().length < 2} className="rounded-md bg-raised px-4 text-sm hover:bg-line disabled:opacity-40">
          {busy === 'search' ? 'Searching' : 'Search'}
        </button>
      </form>
      {results && results.length === 0 && <p className="text-sm text-muted">No games found with that name. Try a shorter name.</p>}
      {results && results.length > 0 && (
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {results.map((candidate) => {
            const key = `${candidate.source}:${candidate.externalId}`
            return (
              <li key={key}>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void choose(candidate)}
                  className="flex w-full items-center gap-3 rounded-md bg-canvas px-3 py-2 text-left text-sm hover:bg-raised disabled:opacity-50"
                >
                  {candidate.imageUrl ? (
                    <img src={candidate.imageUrl} alt="" className="h-9 w-20 shrink-0 rounded-sm object-cover" />
                  ) : (
                    <span className="h-9 w-20 shrink-0 rounded-sm bg-raised" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {busy === key ? 'Loading' : candidate.source === 'steam' ? 'Steam' : `RAWG${candidate.released ? `, ${candidate.released.slice(0, 4)}` : ''}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ManageTab({ game }: { game: Game }) {
  const { refresh, setError, select } = useLauncher()
  const [title, setTitle] = useState(game.title)
  const [args, setArgs] = useState(game.launch?.type === 'exe' ? game.launch.args : '')
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setTitle(game.title)
    setArgs(game.launch?.type === 'exe' ? game.launch.args : '')
  }, [game.id, game.title, game.launch])

  async function update(patch: GamePatch) {
    try {
      await window.api.library.update(game.id, patch)
      await refresh()
    } catch (error) {
      setError(errorMessage(error))
    }
  }

  async function run(task: () => Promise<unknown>) {
    setBusy(true)
    try {
      await task()
      await refresh()
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const exePath = game.launch?.type === 'exe' ? game.launch.exePath : null
  const input = 'flex-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm outline-none placeholder:text-muted/60 focus:border-accent-bright'
  const secondary = 'rounded-md bg-raised px-4 py-2 text-sm hover:bg-line disabled:opacity-40'

  return (
    <div className="grid grid-cols-2 gap-x-10 gap-y-8">
      <section className="flex flex-col gap-2">
        <label htmlFor="game-title" className="text-sm font-semibold">
          Name
        </label>
        <div className="flex gap-2">
          <input id="game-title" value={title} onChange={(event) => setTitle(event.target.value)} className={input} />
          <button type="button" disabled={title.trim() === game.title || title.trim().length === 0} onClick={() => void update({ title: title.trim() })} className={secondary}>
            Rename
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Section</h3>
        <div className="flex gap-2">
          {(['game', 'tool'] as const).map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => game.category !== category && void update({ category })}
              className={`rounded-md px-4 py-2 text-sm ${game.category === category ? 'bg-ink text-canvas' : 'bg-raised text-muted hover:text-ink'}`}
            >
              {category === 'game' ? 'Game' : 'Tool'}
            </button>
          ))}
        </div>
      </section>

      <section className="col-span-2 flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Cover and details</h3>
          <span className="text-xs text-muted">
            {game.metadata ? `Matched to ${game.metadata.name} on ${game.metadata.source === 'steam' ? 'Steam' : 'RAWG'}` : 'No match yet'}
          </span>
        </div>
        {searching ? (
          <MatchSearch game={game} onDone={() => setSearching(false)} />
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSearching(true)} className={secondary}>
              {game.metadata ? 'Wrong game? Search again' : 'Search by name'}
            </button>
            {game.metadata && (
              <>
                <button type="button" disabled={busy} onClick={() => void run(() => window.api.metadata.refresh(game.id))} className={secondary}>
                  Update details
                </button>
                <button type="button" disabled={busy} onClick={() => void run(() => window.api.metadata.clear(game.id))} className={secondary}>
                  Remove cover and details
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {game.launch?.type === 'uri' ? (
        <section className="col-span-2 text-sm text-muted">This game starts through its own launcher.</section>
      ) : (
        game.exeCandidates.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Executable</h3>
            {game.needsReview && <p className="text-xs text-warn">Several files look like the game. Pick the one that starts it.</p>}
            <div className="flex flex-col gap-1">
              {game.exeCandidates.map((candidate) => {
                const selected = exePath?.toLowerCase() === candidate.path.toLowerCase()
                return (
                  <button
                    key={candidate.path}
                    type="button"
                    onClick={() => !selected && void update({ exePath: candidate.path })}
                    className={`flex items-center justify-between rounded-md px-3 py-2 text-left text-sm ${selected ? 'bg-accent/25 ring-1 ring-accent-bright' : 'bg-canvas hover:bg-raised'}`}
                    title={candidate.path}
                  >
                    <span className="truncate">{fileName(candidate.path)}</span>
                    <span className="ml-3 shrink-0 text-xs text-muted">{formatBytes(candidate.sizeBytes)}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      )}

      {game.launch?.type === 'exe' && (
        <section className="flex flex-col gap-2">
          <label htmlFor="game-args" className="text-sm font-semibold">
            Launch options
          </label>
          <div className="flex gap-2">
            <input id="game-args" value={args} placeholder="For example -windowed -skipintro" onChange={(event) => setArgs(event.target.value)} className={input} />
            <button type="button" disabled={args === game.launch.args} onClick={() => void update({ launchArgs: args })} className={secondary}>
              Save
            </button>
          </div>
        </section>
      )}

      <section className="col-span-2 flex items-center justify-between border-t border-line pt-5 text-sm text-muted">
        <span>Found through {game.sources.map((source) => SOURCE_LABELS[source] ?? source).join(', ')}.</span>
        <div className="flex gap-4">
          <button type="button" onClick={() => void window.api.library.openFolder(game.id)} className="hover:text-ink">
            Open folder
          </button>
          <button
            type="button"
            onClick={() => {
              void update({ hidden: !game.hidden })
              if (!game.hidden) select(null)
            }}
            className="hover:text-ink"
          >
            {game.hidden ? 'Show in library' : 'Hide from library'}
          </button>
        </div>
      </section>
    </div>
  )
}

export function GameModal() {
  const { games, selectedGameId, select, refresh, setError } = useLauncher()
  const game = games.find((item) => item.id === selectedGameId) ?? null
  const [tab, setTab] = useState<Tab>('about')
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTab('about')
    dialogRef.current?.focus()
  }, [game?.id])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && select(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])

  if (!game) return null

  const metadata = game.metadata
  const logo = logoUrl(game)
  const subtitle = [metadata?.developers[0], metadata?.releaseDate].filter(Boolean).join(', ')
  const rating = metadata?.rating !== null && metadata?.rating !== undefined ? `${metadata.rating}%` : null

  async function toggleFavorite() {
    try {
      await window.api.library.update(game!.id, { favorite: !game!.favorite })
      await refresh()
    } catch (error) {
      setError(errorMessage(error))
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" onClick={() => select(null)}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={game.title}
        onClick={(event) => event.stopPropagation()}
        className="relative max-h-[92vh] w-full max-w-[1100px] overflow-y-auto rounded-xl bg-surface shadow-[0_30px_120px_rgba(0,0,0,0.6)] outline-none"
      >
        <div className="relative h-[320px]">
          <Hero game={game} className="absolute inset-0" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" />
          <button
            type="button"
            onClick={() => select(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-lg hover:bg-black/75"
            aria-label="Close"
          >
            ✕
          </button>
          <div className="absolute bottom-6 left-[268px] right-8">
            {logo ? <img src={logo} alt="" className="max-h-28 max-w-[420px] object-contain object-left drop-shadow-[0_4px_18px_rgba(0,0,0,0.7)]" /> : null}
          </div>
        </div>

        <div className="grid grid-cols-[200px_minmax(0,1fr)] gap-x-9 px-8">
          <div className="relative z-10 -mt-[190px] aspect-[2/3] w-[200px] overflow-hidden rounded-lg shadow-[0_18px_50px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
            <Cover game={game} large />
          </div>

          <div className="flex min-w-0 flex-col gap-5 pt-1">
            <div>
              <h2 className={`font-display font-semibold leading-tight ${logo ? 'text-2xl' : 'text-4xl'}`}>{game.title}</h2>
              {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <PlayButton game={game} />
              <button type="button" onClick={() => void toggleFavorite()} className="rounded-md bg-raised px-4 py-3 text-sm hover:bg-line" aria-pressed={game.favorite}>
                {game.favorite ? '★ Favorite' : '☆ Add to favorites'}
              </button>
            </div>
            <div className="grid grid-cols-4 gap-6 border-t border-line pt-5">
              <Stat label="Played" value={game.playtimeSeconds > 0 ? formatPlaytime(game.playtimeSeconds) : '0 h'} />
              <Stat label="Last played" value={formatRelative(game.lastPlayedAt)} />
              <Stat label="Player reviews" value={rating ?? 'No rating'} detail={metadata?.ratingLabel} />
              <Stat label="Metacritic" value={metadata?.metacritic ? String(metadata.metacritic) : 'None'} />
            </div>
          </div>
        </div>

        <div className="mt-8 flex gap-6 border-b border-line px-8" role="tablist">
          {(['about', 'manage'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              onClick={() => setTab(item)}
              className={`-mb-px border-b-2 pb-3 text-sm font-semibold ${tab === item ? 'border-accent-bright text-ink' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {item === 'about' ? 'About' : 'Manage'}
            </button>
          ))}
        </div>

        <div className="px-8 py-7">{tab === 'about' ? <AboutTab game={game} /> : <ManageTab game={game} />}</div>
      </div>
    </div>
  )
}
