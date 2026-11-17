import { useEffect, useMemo, useRef, useState } from 'react'
import type { Game } from '@shared/types'
import { Cover } from '../components/GameArt'
import { formatPlaytime, formatRelative, heroUrl, logoUrl, releaseYear, titleHue } from '../format'
import { useLauncher } from '../store'
import { EmptyHome } from './HomeView'
import { playGame, useHomeData, useOverlayOpen } from './homeData'

type Shelf = 'recent' | 'favorites' | 'all'

const SHELVES: { id: Shelf; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'all', label: 'All games' }
]

/** The focused game's art fills the screen; each change fades in over the previous one with a slow push-in. */
function Backdrop({ game }: { game: Game }) {
  const [layers, setLayers] = useState<Game[]>([game])
  useEffect(() => {
    setLayers((previous) => [...previous.filter((item) => item.id !== game.id).slice(-1), game])
  }, [game])

  return (
    <div className="absolute inset-0 overflow-hidden bg-canvas">
      {layers.map((layer, index) => {
        const url = heroUrl(layer)
        const hue = titleHue(layer.title)
        const top = index === layers.length - 1
        return (
          <div key={layer.id} className={`absolute inset-0 ${top ? 'animate-[backdrop-in_700ms_ease-out_both]' : ''}`}>
            {url ? (
              <img src={url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover motion-safe:animate-[ken-burns_14s_ease-out_both]" />
            ) : (
              <div className="absolute inset-0" style={{ background: `radial-gradient(90% 90% at 70% 30%, hsl(${hue} 45% 26%), hsl(${(hue + 40) % 360} 40% 8%) 70%)` }} />
            )}
          </div>
        )
      })}
      {/* Darken where text and the shelf sit, keep the art bright in the upper right. */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#07080c]/95 via-[#07080c]/55 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#07080c] via-[#07080c]/30 to-transparent" />
    </div>
  )
}

function GameInfo({ game }: { game: Game }) {
  const { select, runningGameIds } = useLauncher()
  const logo = logoUrl(game)
  const running = runningGameIds.includes(game.id)
  const facts = [game.platform === 'switch' ? 'Nintendo Switch' : null, game.metadata?.genres.slice(0, 2).join(' · '), releaseYear(game)].filter(Boolean)

  return (
    <div key={game.id} className="flex max-w-[560px] flex-col gap-5 motion-safe:animate-[rise-in_450ms_cubic-bezier(.2,.8,.2,1)_both]">
      {logo ? (
        <img src={logo} alt={game.title} className="max-h-36 max-w-[460px] object-contain object-left drop-shadow-[0_6px_24px_rgba(0,0,0,0.8)]" />
      ) : (
        <h1 className="font-display text-6xl font-semibold uppercase leading-[0.95] tracking-tight text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)]">{game.title}</h1>
      )}
      {facts.length > 0 && <p className="font-display text-sm uppercase tracking-[0.18em] text-white/60">{facts.join('   /   ')}</p>}
      {game.metadata?.shortDescription && <p className="line-clamp-2 text-[15px] leading-relaxed text-white/80">{game.metadata.shortDescription}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={running || game.launch === null}
          onClick={() => void playGame(game)}
          className="group flex items-center gap-3 rounded-full bg-accent-bright py-3 pl-5 pr-8 font-display text-lg font-semibold text-black transition-transform duration-150 enabled:hover:scale-[1.04] enabled:active:scale-95 disabled:opacity-60"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/85 text-accent-bright">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-3.5 w-3.5" fill="currentColor" aria-hidden>
              <path d="M7 4.5v15l12.5-7.5z" />
            </svg>
          </span>
          {running ? 'Playing' : game.lastPlayedAt ? 'Resume' : 'Play'}
        </button>
        <button
          type="button"
          onClick={() => select(game.id)}
          className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
          aria-label="Details"
          title="Details (I)"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <circle cx="5" cy="12" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
          </svg>
        </button>
        <div className="ml-4 flex gap-6 text-white/70">
          <div>
            <div className="font-display text-xl text-white">{game.playtimeSeconds > 0 ? formatPlaytime(game.playtimeSeconds) : '0 h'}</div>
            <div className="text-xs uppercase tracking-widest">Played</div>
          </div>
          <div>
            <div className="font-display text-xl text-white">{formatRelative(game.lastPlayedAt)}</div>
            <div className="text-xs uppercase tracking-widest">Last session</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Cinema Home: one game at a time on a full-screen stage, a shelf of covers along the bottom. Arrow keys move, Enter plays. */
export function CinemaHome() {
  const { select, loaded } = useLauncher()
  const data = useHomeData()
  const overlayOpen = useOverlayOpen()
  const [shelf, setShelf] = useState<Shelf>('recent')
  const [focusId, setFocusId] = useState<number | null>(null)
  const tileRefs = useRef(new Map<number, HTMLButtonElement>())
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const list = useMemo(() => {
    if (shelf === 'favorites') return data.favorites
    if (shelf === 'all') return [...data.visible].sort((a, b) => a.title.localeCompare(b.title))
    const played = new Set(data.recentlyPlayed.map((game) => game.id))
    return [...data.recentlyPlayed, ...data.recentlyAdded.filter((game) => !played.has(game.id))]
  }, [shelf, data])

  const index = Math.max(0, list.findIndex((game) => game.id === focusId))
  const focused = list[index] ?? data.recentlyPlayed[0] ?? data.visible[0]

  const move = (step: number) => {
    if (list.length === 0) return
    const next = list[Math.min(list.length - 1, Math.max(0, index + step))]!
    setFocusId(next.id)
  }

  useEffect(() => {
    if (!focused) return
    tileRefs.current.get(focused.id)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [focused])

  useEffect(() => {
    if (overlayOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (event.key === 'ArrowRight') move(1)
      else if (event.key === 'ArrowLeft') move(-1)
      else if (event.key === 'Home') move(-list.length)
      else if (event.key === 'End') move(list.length)
      else if (event.key === 'Enter' && focused) void playGame(focused)
      else if ((event.key === 'i' || event.key === 'I') && focused) select(focused.id)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (data.visible.length === 0) return loaded ? <div className="h-full pt-24"><EmptyHome /></div> : null
  if (!focused) return null

  return (
    <div className="relative h-full overflow-hidden">
      <Backdrop game={focused} />

      <div className="absolute left-14 top-[22%] z-10">
        <GameInfo game={focused} />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 pb-9">
        <div className="mb-3 flex items-center gap-6 px-14">
          {SHELVES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setShelf(item.id)
                setFocusId(null)
              }}
              className={`font-display text-sm uppercase tracking-[0.2em] transition-colors ${shelf === item.id ? 'text-accent-bright' : 'text-white/50 hover:text-white'}`}
            >
              {item.label}
            </button>
          ))}
          <span className="ml-auto text-xs uppercase tracking-[0.2em] text-white/40">
            {list.length > 0 ? `${index + 1} / ${list.length}` : ''}
          </span>
        </div>

        {list.length === 0 ? (
          <p className="px-14 py-16 text-white/50">No favorites yet. Open a game and add it to your favorites.</p>
        ) : (
          <div key={shelf} className="no-scrollbar flex items-end gap-4 overflow-x-auto px-14 pb-4 pt-8 motion-safe:animate-[rise-in_350ms_ease-out_both]" role="listbox" aria-label="Games">
            {list.map((game) => {
              const active = game.id === focused.id
              return (
                <button
                  key={game.id}
                  ref={(element) => {
                    if (element) tileRefs.current.set(game.id, element)
                    else tileRefs.current.delete(game.id)
                  }}
                  type="button"
                  role="option"
                  aria-selected={active}
                  aria-label={game.title}
                  onMouseEnter={() => {
                    if (hoverTimer.current) clearTimeout(hoverTimer.current)
                    hoverTimer.current = setTimeout(() => setFocusId(game.id), 140)
                  }}
                  onMouseLeave={() => hoverTimer.current && clearTimeout(hoverTimer.current)}
                  onFocus={() => setFocusId(game.id)}
                  onClick={() => (active ? select(game.id) : setFocusId(game.id))}
                  onDoubleClick={() => void playGame(game)}
                  className={`relative shrink-0 origin-bottom overflow-hidden rounded-lg transition-[width,transform,box-shadow,opacity] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] focus-visible:outline-none ${
                    active
                      ? 'w-[176px] -translate-y-1 opacity-100 shadow-[0_0_0_3px_var(--color-accent-bright),0_18px_50px_rgba(0,0,0,0.7),0_0_40px_color-mix(in_srgb,var(--color-accent-bright)_35%,transparent)]'
                      : 'w-[132px] opacity-75 hover:opacity-100'
                  }`}
                >
                  <div className="aspect-[2/3] w-full">
                    <Cover game={game} />
                  </div>
                </button>
              )
            })}
          </div>
        )}
        <p className="px-14 text-xs text-white/35">← → to move · Enter to play · I for details</p>
      </div>
    </div>
  )
}
