import { useEffect, useState } from 'react'
import type { GamePatch } from '@shared/types'
import { fileName, formatBytes, formatDate } from '../format'
import { useLauncher } from '../store'
import { GameArt } from './GameArt'

const SOURCE_LABELS: Record<string, string> = {
  folder: 'Found in a games folder',
  registry: 'Listed in installed programs',
  shortcut: 'Has a desktop or Start menu shortcut',
  steam: 'Steam',
  epic: 'Epic Games'
}

export function GameDetail() {
  const { games, selectedGameId, select, refresh, setError } = useLauncher()
  const game = games.find((item) => item.id === selectedGameId) ?? null
  const [title, setTitle] = useState('')
  const [args, setArgs] = useState('')
  const [launching, setLaunching] = useState(false)

  useEffect(() => {
    if (!game) return
    setTitle(game.title)
    setArgs(game.launch?.type === 'exe' ? game.launch.args : '')
  }, [game?.id, game?.title, game?.launch])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && select(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])

  if (!game) return null

  async function update(patch: GamePatch) {
    try {
      await window.api.library.update(game!.id, patch)
      await refresh()
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    }
  }

  async function play() {
    setLaunching(true)
    try {
      await window.api.library.launch(game!.id)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setTimeout(() => setLaunching(false), 1500)
    }
  }

  const exePath = game.launch?.type === 'exe' ? game.launch.exePath : null
  const canPlay = game.status === 'installed' && game.launch !== null

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/50" onClick={() => select(null)}>
      <aside
        className="flex h-full w-[520px] max-w-full flex-col overflow-y-auto bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        aria-label={`${game.title} details`}
      >
        <div className="relative h-56 shrink-0">
          <GameArt game={game} size="hero" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" />
          <button type="button" onClick={() => select(null)} className="absolute right-4 top-4 rounded-md bg-black/40 px-2.5 py-1 text-sm hover:bg-black/60" aria-label="Close">
            ✕
          </button>
          <h2 className="absolute bottom-4 left-6 right-6 font-display text-3xl font-semibold leading-tight">{game.title}</h2>
        </div>

        <div className="flex flex-col gap-6 px-6 pb-8 pt-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!canPlay || launching}
              onClick={() => void play()}
              className="rounded-md bg-accent px-8 py-2.5 font-semibold text-white enabled:hover:bg-accent-bright enabled:hover:text-black disabled:opacity-40"
            >
              {launching ? 'Starting…' : 'Play'}
            </button>
            <button type="button" onClick={() => void update({ favorite: !game.favorite })} className="rounded-md bg-raised px-4 py-2.5 text-sm hover:bg-line">
              {game.favorite ? '★ Favorite' : '☆ Add to favorites'}
            </button>
            <button type="button" onClick={() => void window.api.library.openFolder(game.id)} className="rounded-md bg-raised px-4 py-2.5 text-sm hover:bg-line">
              Open folder
            </button>
          </div>

          {game.needsReview && (
            <p className="rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-ink">
              Several executables look like the game. Pick the one that starts it below.
            </p>
          )}

          <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Folder</dt>
            <dd className="break-all">{game.installPath}</dd>
            <dt className="text-muted">Size</dt>
            <dd>{formatBytes(game.sizeBytes)}</dd>
            <dt className="text-muted">Engine</dt>
            <dd className="capitalize">{game.engine === 'unknown' ? 'Not detected' : game.engine}</dd>
            <dt className="text-muted">Added</dt>
            <dd>{formatDate(game.addedAt)}</dd>
            <dt className="text-muted">Detected by</dt>
            <dd>{game.sources.map((source) => SOURCE_LABELS[source] ?? source).join(', ')}</dd>
          </dl>

          <section className="flex flex-col gap-2">
            <label htmlFor="title" className="text-sm font-semibold">
              Name
            </label>
            <div className="flex gap-2">
              <input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="flex-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-bright"
              />
              <button
                type="button"
                disabled={title.trim() === game.title || title.trim().length === 0}
                onClick={() => void update({ title: title.trim() })}
                className="rounded-md bg-raised px-4 text-sm hover:bg-line disabled:opacity-40"
              >
                Rename
              </button>
            </div>
          </section>

          {game.launch?.type === 'exe' || game.exeCandidates.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Executable</h3>
              {game.launch?.type === 'uri' ? (
                <p className="text-sm text-muted">This game starts through its launcher.</p>
              ) : (
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
              )}
            </section>
          ) : null}

          {game.launch?.type === 'exe' && (
            <section className="flex flex-col gap-2">
              <label htmlFor="args" className="text-sm font-semibold">
                Launch options
              </label>
              <div className="flex gap-2">
                <input
                  id="args"
                  value={args}
                  placeholder="For example -windowed -skipintro"
                  onChange={(event) => setArgs(event.target.value)}
                  className="flex-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm outline-none placeholder:text-muted/60 focus:border-accent-bright"
                />
                <button
                  type="button"
                  disabled={args === game.launch.args}
                  onClick={() => void update({ launchArgs: args })}
                  className="rounded-md bg-raised px-4 text-sm hover:bg-line disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </section>
          )}

          <button type="button" onClick={() => void update({ hidden: !game.hidden })} className="self-start text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
            {game.hidden ? 'Show in library' : 'Hide from library'}
          </button>
        </div>
      </aside>
    </div>
  )
}
