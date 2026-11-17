import { useEffect, useState } from 'react'
import type { EmulatedPlatform, EmulationPlatformState } from '@shared/types'
import { errorMessage, useLauncher } from '../store'

interface ConsoleInfo {
  platform: EmulatedPlatform
  name: string
  files: string
  /** Simple mark drawn for the list, not a console logo. */
  icon: string
}

const CONSOLES: ConsoleInfo[] = [
  {
    platform: 'switch',
    name: 'Nintendo Switch',
    files: '.nsp and .xci files',
    icon: 'M8 4h3v16H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4zM13 4h3a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-3zM7.5 9.5h.01M16.5 14.5h.01'
  }
]

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={label} />
      <span className="h-6 w-11 rounded-full bg-raised transition-colors peer-checked:bg-accent" />
      <span className="absolute left-1 h-4 w-4 rounded-full bg-ink transition-transform duration-200 peer-checked:translate-x-5" />
    </label>
  )
}

function ConsoleRow({ info }: { info: ConsoleInfo }) {
  const { games, refresh, setError, settings, openSettings, setView } = useLauncher()
  const [state, setState] = useState<EmulationPlatformState | null>(null)
  const emulators = games.filter((game) => game.category === 'emulator' && game.launch?.type === 'exe')

  useEffect(() => {
    void window.api.emulation.get(info.platform).then(setState)
  }, [info.platform, games.length])

  async function run(task: () => Promise<EmulationPlatformState>) {
    try {
      setState(await task())
      await refresh()
    } catch (error) {
      setError(errorMessage(error))
    }
  }

  const resolved = emulators.find((game) => game.id === state?.resolvedEmulatorId)
  const missingKeys = !settings?.hasRawgKey && !settings?.hasSteamGridDbKey

  return (
    <li className="flex flex-col gap-4 px-5 py-5">
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-raised text-accent-bright">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round" aria-hidden>
            <path d={info.icon} />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{info.name}</div>
          <div className="text-sm text-muted">
            {state?.enabled ? `${state.gameCount} ${state.gameCount === 1 ? 'game' : 'games'} found. Looks for ${info.files}.` : `Looks for ${info.files} in your game locations.`}
          </div>
        </div>
        <Toggle checked={state?.enabled ?? false} label={`Find ${info.name} games`} onChange={(value) => void run(() => window.api.emulation.setEnabled(info.platform, value))} />
      </div>

      {state?.enabled && (
        <div className="flex flex-col gap-3 pl-[60px] motion-safe:animate-[fade-in_200ms_ease-out]">
          <div className="flex items-center gap-3">
            <label htmlFor={`emulator-${info.platform}`} className="w-28 shrink-0 text-sm text-muted">
              Plays with
            </label>
            {emulators.length === 0 ? (
              <span className="text-sm">
                No emulator yet.{' '}
                <button type="button" onClick={() => setView('emulators')} className="font-semibold text-accent-bright underline-offset-4 hover:underline">
                  Add one in Emulators
                </button>
              </span>
            ) : (
              <select
                id={`emulator-${info.platform}`}
                value={state.emulatorId ?? ''}
                onChange={(event) => void run(() => window.api.emulation.setEmulator(info.platform, event.target.value ? Number(event.target.value) : null))}
                className="min-w-64 rounded-md border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-bright"
              >
                <option value="">Automatic{resolved && state.emulatorId === null ? ` (${resolved.title})` : ''}</option>
                {emulators.map((emulator) => (
                  <option key={emulator.id} value={emulator.id}>
                    {emulator.title}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="text-xs text-muted">
            Games open straight in full screen with yuzu, suyu, Sudachi, Citron, Eden and Torzu; Ryujinx opens them in its window. Folders set up in yuzu-style emulators and in Ryujinx are searched too.
          </p>
          {missingKeys && (
            <p className="rounded-md bg-canvas px-4 py-3 text-sm text-muted">
              Switch games are not on Steam. For their covers and details, add free RAWG and SteamGridDB keys in{' '}
              <button type="button" onClick={() => openSettings('covers')} className="font-semibold text-accent-bright underline-offset-4 hover:underline">
                Covers and game details
              </button>
              .
            </p>
          )}
        </div>
      )}
    </li>
  )
}

/** Settings module: consoles whose game files Orus looks for, and the emulator that plays them. */
export function EmulationSection() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-2xl font-semibold">Emulated games</h2>
        <p className="mt-1 text-sm text-muted">Turn on a console and its games show up in your library and on Home next to your PC games.</p>
      </div>
      <ul className="divide-y divide-line rounded-lg bg-surface">
        {CONSOLES.map((info) => (
          <ConsoleRow key={info.platform} info={info} />
        ))}
      </ul>
    </section>
  )
}
