import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { DayPlaytime, Game } from '@shared/types'
import { computeProfileStats, formatTotalHours } from '@shared/profileStats'
import { coverUrl, formatHoursShort, iconUrl, titleHue } from '../format'
import { useLauncher } from '../store'
import { Cover } from './GameArt'

function dayLabel(date: string, index: number, count: number): { short: string; long: string } {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(year!, month! - 1, day!)
  const long = value.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  if (index === count - 1) return { short: 'Today', long }
  return { short: value.toLocaleDateString(undefined, { weekday: 'short' }), long }
}

/** Gridline steps in hours that keep about four lines on the chart. */
function niceStep(maxHours: number): number {
  for (const step of [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12]) if (maxHours / step <= 4) return step
  return 24
}

/**
 * Round badge for a day's most played game: its cover, else the executable's icon, else its initial.
 * The cover goes first because many executables have no icon of their own, and Windows then hands
 * back its generic blank program icon, which is not an empty image and so cannot be told apart.
 */
function GameBadge({ game, style }: { game: Game; style: CSSProperties }) {
  const cover = coverUrl(game)
  const icon = iconUrl(game.iconPath)
  const [failed, setFailed] = useState<string[]>([])
  const url = [cover, icon].find((candidate) => candidate !== null && !failed.includes(candidate)) ?? null
  const hue = titleHue(game.title)
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center overflow-hidden rounded-full bg-raised ring-2 ring-canvas transition-[bottom] duration-700 ease-[cubic-bezier(.2,.8,.2,1)]"
      style={url ? style : { ...style, background: `hsl(${hue} 38% 30%)` }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          onError={() => setFailed((list) => [...list, url])}
          className={`h-full w-full ${url === icon ? 'object-contain p-1' : 'object-cover'}`}
        />
      ) : (
        <span className="font-display text-xs font-semibold text-white/90">{game.title.charAt(0).toUpperCase()}</span>
      )}
    </span>
  )
}

/** Seven bars, one per day, each topped by the day's most played game; hover or focus a bar for its exact time. Single series: no legend, the title names it. */
function DailyChart({ days, games }: { days: DayPlaytime[]; games: Game[] }) {
  const gamesById = useMemo(() => new Map(games.map((game) => [game.id, game])), [games])
  const [active, setActive] = useState<number | null>(null)
  const maxHours = Math.max(...days.map((day) => day.seconds / 3600), 0.5)
  const step = niceStep(maxHours)
  const top = Math.ceil(maxHours / step) * step
  const lines = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step)
  const total = days.reduce((sum, day) => sum + day.seconds, 0)

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex items-baseline justify-between">
        <span className="text-sm font-semibold">Time played, last 7 days</span>
        <span className="text-sm text-muted">{formatTotalHours(total)} this week</span>
      </figcaption>
      <div className="relative flex h-64 gap-3 pl-10 pt-9">
        {/* Recessive grid and y labels. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-7 top-9" aria-hidden>
          {lines.map((hours) => (
            <div key={hours} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${(hours / top) * 100}%` }}>
              <span className="w-8 translate-y-1/2 text-right text-[11px] tabular-nums text-muted">{hours === 0 ? '0' : `${hours}h`}</span>
              <span className={`h-px flex-1 translate-y-1/2 ${hours === 0 ? 'bg-line' : 'bg-line/50'}`} />
            </div>
          ))}
        </div>
        {days.map((day, index) => {
          const label = dayLabel(day.date, index, days.length)
          const height = (day.seconds / 3600 / top) * 100
          const isActive = active === index
          const game = day.topGameId === null ? undefined : gamesById.get(day.topGameId)
          return (
            <div key={day.date} className="relative flex flex-1 flex-col items-center">
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                aria-label={`${label.long}: ${day.seconds > 0 ? formatHoursShort(day.seconds) : 'not played'}${game ? `, mostly ${game.title}` : ''}`}
                className="relative flex w-full flex-1 items-end justify-center focus-visible:outline-none"
              >
                <span
                  className={`block w-full max-w-11 rounded-t-[4px] transition-[height,opacity] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] ${day.seconds > 0 ? 'bg-accent-bright' : ''} ${active !== null && !isActive ? 'opacity-50' : ''}`}
                  style={{ height: `${Math.max(day.seconds > 0 ? 1.5 : 0, height)}%` }}
                />
                {game && <GameBadge key={game.id} game={game} style={{ bottom: `calc(${height}% + 6px)` }} />}
                {isActive && (
                  <span className="absolute z-10 mb-2 whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-xs text-canvas shadow-lg" style={{ bottom: game ? `calc(${height}% + 36px)` : `${height}%` }}>
                    <span className="font-semibold">{day.seconds > 0 ? formatHoursShort(day.seconds) : 'Not played'}</span>
                    {game && <span className="block text-[11px] opacity-70">{game.title}</span>}
                    <span className="block text-[11px] opacity-70">{label.long}</span>
                  </span>
                )}
              </button>
              <span className={`mt-2 h-5 text-xs ${index === days.length - 1 ? 'font-semibold text-ink' : 'text-muted'}`}>{label.short}</span>
            </div>
          )
        })}
      </div>
    </figure>
  )
}

export function MostPlayedList({ ranking, onPick }: { ranking: Game[]; onPick: (game: Game) => void }) {
  const top = ranking[0]?.playtimeSeconds ?? 1
  if (ranking.length === 0) return <p className="rounded-md bg-canvas px-4 py-6 text-center text-sm text-muted">Nothing here yet. Start a game from Orus and your hours show up here.</p>
  return (
    <ol className="flex flex-col gap-1.5">
      {ranking.map((game, index) => (
        <li key={game.id}>
          <button type="button" onClick={() => onPick(game)} className="flex w-full items-center gap-4 rounded-md bg-canvas px-3 py-2 text-left hover:bg-raised">
            <span className={`w-6 text-center font-display text-lg font-semibold ${index === 0 ? 'text-accent-bright' : 'text-muted'}`}>{index + 1}</span>
            <span className="h-12 w-8 shrink-0 overflow-hidden rounded-sm">
              <Cover game={game} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm">{game.title}</span>
                <span className="shrink-0 text-sm tabular-nums text-muted">{formatHoursShort(game.playtimeSeconds)}</span>
              </span>
              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-raised">
                <span className="block h-full rounded-full bg-accent-bright" style={{ width: `${Math.max(3, (game.playtimeSeconds / top) * 100)}%` }} />
              </span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}

/** Statistics: total time, the last seven days as bars, and the most played games. */
export function StatsModal() {
  const { statsOpen, games, select } = useLauncher()
  const [days, setDays] = useState<DayPlaytime[] | null>(null)
  const stats = useMemo(() => computeProfileStats(games, 10), [games])
  const close = () => useLauncher.setState({ statsOpen: false })

  useEffect(() => {
    if (!statsOpen) return
    void window.api.stats.daily(7).then(setDays)
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [statsOpen, games])

  if (!statsOpen) return null
  return (
    <div data-gamepad-scope="40" className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm motion-safe:animate-[fade-in_150ms_ease-out]" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Statistics"
        onClick={(event) => event.stopPropagation()}
        className="relative max-h-[90vh] w-full max-w-[760px] overflow-y-auto rounded-xl bg-surface p-8 shadow-[0_30px_120px_rgba(0,0,0,0.6)] motion-safe:animate-[pop-in_200ms_cubic-bezier(.2,.9,.3,1.1)]"
      >
        <button type="button" onClick={close} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-lg hover:bg-black/70" data-gamepad-back aria-label="Close">
          ✕
        </button>
        <h2 className="font-display text-3xl font-semibold">Statistics</h2>

        <div className="mt-6 flex items-end gap-10">
          <div>
            <div className="font-display text-5xl font-semibold leading-none">{formatTotalHours(stats.totalSeconds)}</div>
            <div className="mt-2 text-sm text-muted">Total time played</div>
          </div>
          <div>
            <div className="font-display text-2xl font-semibold leading-none">{stats.gamesPlayed}</div>
            <div className="mt-2 text-sm text-muted">Games played</div>
          </div>
          <div>
            <div className="font-display text-2xl font-semibold leading-none">{stats.sessions}</div>
            <div className="mt-2 text-sm text-muted">Play sessions</div>
          </div>
        </div>

        <div className="mt-8 rounded-lg bg-canvas px-5 py-5">{days ? <DailyChart days={days} games={games} /> : <div className="h-72" />}</div>

        <section className="mt-8 flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Most played games</h3>
          <MostPlayedList
            ranking={stats.ranking}
            onPick={(game) => {
              useLauncher.setState({ statsOpen: false, profileOpen: false })
              select(game.id)
            }}
          />
        </section>
      </div>
    </div>
  )
}
