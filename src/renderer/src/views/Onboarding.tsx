import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { ImportSummary, LibraryRoot, ScanMode } from '@shared/types'
import { Avatar } from '../components/Avatar'
import { Cover } from '../components/GameArt'
import { OrusMark } from '../components/OrusMark'
import { PHASE_LABELS, ProgressBar } from '../components/ScanOverlay'
import { WindowControls } from '../components/WindowControls'
import { shortenPath } from '../format'
import { errorMessage, useLauncher } from '../store'

/** The welcome screens wear the logo's blue, whatever skin comes later. */
const WELCOME_COLORS = {
  '--color-accent': '#1467e0',
  '--color-accent-bright': '#3d8bff'
} as CSSProperties

const STEPS = ['welcome', 'profile', 'games', 'scan'] as const
type Step = (typeof STEPS)[number]

function Slide({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <section aria-hidden={!active} inert={!active} className="flex h-full w-full shrink-0 items-center justify-center px-10">
      <div className="w-full max-w-[560px]">{children}</div>
    </section>
  )
}

function PrimaryButton({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group inline-flex items-center gap-3 rounded-full bg-accent px-8 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_30px_rgba(20,103,224,0.35)] transition-[transform,background-color] duration-150 enabled:hover:scale-[1.03] enabled:hover:bg-accent-bright enabled:active:scale-[0.98] disabled:opacity-40"
    >
      {children}
      <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-enabled:group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </button>
  )
}

function WelcomeStep({ onNext, onRestored }: { onNext: () => void; onRestored: (summary: ImportSummary) => void }) {
  const { app, setError } = useLauncher()
  const [busy, setBusy] = useState(false)

  async function restore(fromLast: boolean) {
    setBusy(true)
    try {
      const summary = fromLast ? await window.api.data.importLastBackup() : await window.api.data.import()
      if (summary) onRestored(summary)
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center text-center">
      <div className="motion-safe:animate-[pop-in_700ms_cubic-bezier(.2,.9,.3,1.25)_both]">
        <OrusMark className="h-28 w-28 drop-shadow-[0_20px_40px_rgba(61,139,255,0.35)]" />
      </div>
      <h1 className="mt-8 font-display text-5xl font-semibold tracking-tight motion-safe:animate-[rise-in_600ms_120ms_cubic-bezier(.2,.8,.2,1)_both]">Welcome to Orus</h1>
      <p className="mt-4 max-w-md text-[17px] leading-relaxed text-muted motion-safe:animate-[rise-in_600ms_220ms_cubic-bezier(.2,.8,.2,1)_both]">
        All the games on your PC in one place, with their covers, details and the hours you play. Let’s set it up, it takes a minute.
      </p>
      <div className="mt-10 flex flex-col items-center gap-4 motion-safe:animate-[rise-in_600ms_320ms_cubic-bezier(.2,.8,.2,1)_both]">
        <PrimaryButton onClick={onNext}>Get started</PrimaryButton>
        {app?.lastBackupPath ? (
          <button type="button" disabled={busy} onClick={() => void restore(true)} className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50">
            {busy ? 'Restoring…' : 'Restore the data I had before'}
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => void restore(false)} className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50">
            {busy ? 'Restoring…' : 'I have an Orus backup'}
          </button>
        )}
      </div>
    </div>
  )
}

function ProfileStep({ active, onNext }: { active: boolean; onNext: () => void }) {
  const { profile, setProfile, setError } = useLauncher()
  const [name, setName] = useState(profile?.name ?? '')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // preventScroll: focusing must not drag the sliding strip sideways.
    if (active) setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 650)
  }, [active])

  async function choosePhoto() {
    try {
      const next = await window.api.profile.choosePhoto()
      if (next) setProfile(next)
    } catch (error) {
      setError(errorMessage(error))
    }
  }

  async function save() {
    if (!name.trim()) return
    setBusy(true)
    try {
      setProfile(await window.api.profile.save(name.trim()))
      onNext()
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col items-center text-center"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <h1 className="font-display text-4xl font-semibold tracking-tight">Who’s playing?</h1>
      <p className="mt-3 text-muted">Your name and photo stay on this PC. No account needed.</p>

      <button type="button" onClick={() => void choosePhoto()} className="group relative mt-9 rounded-full" aria-label={profile?.avatarFile ? 'Change photo' : 'Add a photo'}>
        <Avatar profile={{ created: name.trim().length > 0, name, avatarFile: profile?.avatarFile ?? null }} className="h-32 w-32 transition-transform duration-200 group-hover:scale-[1.04]" textClass="text-5xl" />
        <span className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full border-4 border-canvas bg-accent text-white transition-transform group-hover:scale-110">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
          </svg>
        </span>
      </button>
      <span className="mt-3 text-xs text-muted">{profile?.avatarFile ? 'Looking good. Click to change it.' : 'Photo is optional'}</span>

      <input
        ref={inputRef}
        value={name}
        maxLength={40}
        onChange={(event) => setName(event.target.value)}
        placeholder="Your name"
        aria-label="Your name"
        className="mt-8 w-full max-w-sm rounded-xl border border-line bg-surface px-5 py-4 text-center text-lg outline-none transition-colors placeholder:text-muted/50 focus:border-accent-bright"
      />
      <div className="mt-9">
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        <PrimaryButton disabled={busy || name.trim().length === 0} onClick={() => void save()}>
          Continue
        </PrimaryButton>
      </div>
    </form>
  )
}

function ChoiceCard({ selected, title, description, badge, icon, onClick }: { selected: boolean; title: string; description: string; badge?: string; icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex w-full items-start gap-4 rounded-2xl border-2 bg-surface p-5 text-left transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 ${
        selected ? 'border-accent-bright shadow-[0_12px_32px_rgba(20,103,224,0.25)]' : 'border-transparent hover:border-line'
      }`}
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${selected ? 'bg-accent text-white' : 'bg-raised text-muted'}`}>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={icon} />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-semibold">
          {title}
          {badge && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-accent-bright">{badge}</span>}
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-muted">{description}</span>
      </span>
      <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-accent-bright' : 'border-line'}`}>
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-accent-bright" />}
      </span>
    </button>
  )
}

function GamesStep({ onStart }: { onStart: (mode: ScanMode) => void }) {
  const { setError } = useLauncher()
  const [mode, setMode] = useState<ScanMode>('auto')
  const [folders, setFolders] = useState<LibraryRoot[]>([])

  useEffect(() => {
    void window.api.roots.list().then((roots) => setFolders(roots.filter((root) => root.kind === 'user')))
  }, [])

  async function addFolder() {
    try {
      const root = await window.api.roots.add()
      if (root) setFolders((current) => (current.some((item) => item.id === root.id) ? current : [...current, root]))
    } catch (error) {
      setError(errorMessage(error))
    }
  }

  async function removeFolder(root: LibraryRoot) {
    await window.api.roots.remove(root.id)
    setFolders((current) => current.filter((item) => item.id !== root.id))
  }

  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Where are your games?</h1>
      <p className="mt-3 text-muted">You can change this later in Settings, Game locations.</p>

      <div className="mt-9 flex w-full flex-col gap-3" role="radiogroup" aria-label="How to find your games">
        <ChoiceCard
          selected={mode === 'auto'}
          onClick={() => setMode('auto')}
          title="Scan my PC automatically"
          badge="Recommended"
          description="Orus checks the usual game folders on every drive, installed programs, Steam, Epic and your shortcuts."
          icon="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4"
        />
        <ChoiceCard
          selected={mode === 'manual'}
          onClick={() => setMode('manual')}
          title="Choose my game folders"
          description="Only the folders you pick are scanned. Good if you keep everything in a few places."
          icon="M3 6h7l2 2h9v11H3z"
        />
      </div>

      {mode === 'manual' && (
        <div className="mt-4 w-full text-left motion-safe:animate-[rise-in_300ms_ease-out_both]">
          {folders.length > 0 && (
            <ul className="mb-3 flex max-h-44 flex-col gap-1.5 overflow-y-auto">
              {folders.map((root) => (
                <li key={root.id} className="flex items-center gap-3 rounded-lg bg-surface px-4 py-2.5 text-sm motion-safe:animate-[rise-in_250ms_ease-out_both]">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-accent-bright" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
                    <path d="M3 6h7l2 2h9v11H3z" />
                  </svg>
                  <span className="min-w-0 flex-1 truncate" title={root.path}>
                    {root.path}
                  </span>
                  <button type="button" onClick={() => void removeFolder(root)} className="text-muted hover:text-danger" aria-label={`Remove ${root.path}`}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => void addFolder()} className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line py-3 text-sm text-muted transition-colors hover:border-accent-bright hover:text-ink">
            <span className="text-lg leading-none">+</span> {folders.length === 0 ? 'Add a folder with games' : 'Add another folder'}
          </button>
        </div>
      )}

      <div className="mt-9">
        <PrimaryButton disabled={mode === 'manual' && folders.length === 0} onClick={() => onStart(mode)}>
          Find my games
        </PrimaryButton>
      </div>
    </div>
  )
}

type ScanPhase = 'scan' | 'covers' | 'done'

function ScanStep({ started, restored, onFinish }: { started: boolean; restored: ImportSummary | null; onFinish: () => void }) {
  const { scanning, progress, metadataProgress, online, games } = useLauncher()
  const [phase, setPhase] = useState<ScanPhase>('scan')
  const seenScan = useRef(false)
  const covers = metadataProgress?.running === true

  useEffect(() => {
    if (!started) return
    if (scanning) {
      seenScan.current = true
      setPhase('scan')
      return
    }
    if (!seenScan.current) return
    if (covers) {
      setPhase('covers')
      return
    }
    // Covers start right after the scan saves; wait a moment before calling it done.
    const timer = setTimeout(() => setPhase('done'), 900)
    return () => clearTimeout(timer)
  }, [started, scanning, covers])

  const found = useMemo(() => games.filter((game) => game.category === 'game' && !game.hidden), [games])
  const preview = found.filter((game) => game.metadata?.coverFile).concat(found.filter((game) => !game.metadata?.coverFile)).slice(0, 7)
  const coverFraction = metadataProgress && metadataProgress.total > 0 ? metadataProgress.done / metadataProgress.total : null

  return (
    <div className="flex flex-col items-center text-center">
      {phase !== 'done' ? (
        <>
          <div className="relative flex h-24 w-24 items-center justify-center">
            <span className="absolute inset-0 rounded-full border-4 border-accent-bright/20" />
            <span className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-accent-bright" />
            <OrusMark className="h-12 w-12" />
          </div>
          <h1 className="mt-8 font-display text-4xl font-semibold tracking-tight">{phase === 'scan' ? (restored ? 'Checking your restored games' : 'Looking for your games') : 'Getting covers and details'}</h1>
          <p className="mt-3 text-muted">
            {phase === 'scan'
              ? progress
                ? `${PHASE_LABELS[progress.phase]}${progress.gamesFound > 0 ? `, ${progress.gamesFound} found so far` : ''}`
                : 'Getting ready'
              : metadataProgress?.currentTitle ?? `${metadataProgress?.done ?? 0} of ${metadataProgress?.total ?? 0}`}
          </p>
          <div className="mt-8 w-full max-w-md">
            <ProgressBar fraction={phase === 'scan' ? (progress?.fraction ?? null) : coverFraction} />
          </div>
          <p className="mt-3 h-5 w-full max-w-md truncate text-xs text-muted/70">
            {phase === 'scan' && progress?.currentPath ? shortenPath(progress.currentPath, 80) : phase === 'covers' && metadataProgress ? `${metadataProgress.done} of ${metadataProgress.total}` : ''}
          </p>
          {phase === 'covers' && (
            <button type="button" onClick={onFinish} className="mt-6 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
              Open Orus now, covers keep coming in the background
            </button>
          )}
        </>
      ) : (
        <>
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-white shadow-[0_12px_40px_rgba(20,103,224,0.45)] motion-safe:animate-[pop-in_500ms_cubic-bezier(.2,.9,.3,1.3)_both]">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h1 className="mt-7 font-display text-4xl font-semibold tracking-tight">
            {found.length === 0 ? 'No games found yet' : `${found.length} ${found.length === 1 ? 'game is' : 'games are'} ready`}
          </h1>
          <p className="mt-3 max-w-md text-muted">
            {found.length === 0
              ? 'Add the folders where you keep your games in Settings, Game locations, and scan again.'
              : restored
                ? `Your data is back: ${restored.sessionsAdded} play sessions and your favorites included.`
                : 'Your library is set up. Have fun.'}
          </p>
          {preview.length > 0 && (
            <div className="mt-8 flex justify-center gap-3">
              {preview.map((game, index) => (
                <div key={game.id} className="aspect-[2/3] w-[70px] overflow-hidden rounded-lg shadow-lg motion-safe:animate-[rise-in_500ms_cubic-bezier(.2,.8,.2,1)_both]" style={{ animationDelay: `${150 + index * 70}ms` }}>
                  <Cover game={game} />
                </div>
              ))}
            </div>
          )}
          <div className="mt-10">
            <PrimaryButton onClick={onFinish}>Start playing</PrimaryButton>
          </div>
        </>
      )}

      {!online && (
        <div role="status" className="mt-8 flex w-full max-w-md items-start gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-left text-sm motion-safe:animate-[rise-in_300ms_ease-out_both]">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-warn" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M3 3l18 18" />
          </svg>
          <span>
            <span className="font-semibold">No internet connection.</span> Your games are found, but their covers and details need internet. When you are connected, go to
            Settings and press <span className="font-semibold">Scan again</span>.
          </span>
        </div>
      )}
    </div>
  )
}

/** First start: welcome, profile, where the games are, then the first scan. Slides move to the left. */
export function Onboarding() {
  const { startScan, setSettings, app, error, dismissError } = useLauncher()
  const [step, setStep] = useState<Step>('welcome')
  const [started, setStarted] = useState(false)
  const [restored, setRestored] = useState<ImportSummary | null>(null)
  const index = STEPS.indexOf(step)

  async function begin(mode: ScanMode) {
    setSettings(await window.api.settings.setScanMode(mode))
    setStep('scan')
    setStarted(true)
    await startScan(false)
  }

  async function onRestored(summary: ImportSummary) {
    setRestored(summary)
    useLauncher.getState().setProfile(await window.api.profile.get())
    setSettings(await window.api.settings.get())
    await useLauncher.getState().refresh()
    setStep('scan')
    setStarted(true)
    await startScan(false)
  }

  async function finish() {
    await window.api.app.completeOnboarding()
    if (app) useLauncher.setState({ app: { ...app, onboardingDone: true }, view: 'home', overlayVisible: false })
  }

  return (
    <div style={WELCOME_COLORS} className="relative h-full overflow-clip bg-canvas">
      {/* Slow-moving light behind the slides. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute -left-1/4 -top-1/3 h-[90vh] w-[90vh] rounded-full bg-[#1467e0]/25 blur-[120px] transition-transform duration-[1200ms] ease-out"
          style={{ transform: `translate(${index * 18}vw, ${index * 6}vh)` }}
        />
        <div
          className="absolute -bottom-1/3 -right-1/4 h-[80vh] w-[80vh] rounded-full bg-[#3d8bff]/15 blur-[120px] transition-transform duration-[1200ms] ease-out"
          style={{ transform: `translate(${-index * 12}vw, ${-index * 4}vh)` }}
        />
      </div>

      <div className="absolute right-6 top-5 z-10 flex items-center">
        <WindowControls />
      </div>

      {index > 0 && step !== 'scan' && (
        <button
          type="button"
          onClick={() => setStep(STEPS[index - 1]!)}
          className="absolute left-8 top-6 z-10 flex items-center gap-2 rounded-full px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>
      )}

      {error && (
        <div role="alert" className="absolute inset-x-0 top-16 z-20 mx-auto flex w-fit max-w-xl items-center gap-4 rounded-full bg-danger/90 px-5 py-2 text-sm text-white">
          <span>{error}</span>
          <button type="button" onClick={dismissError} className="font-semibold">
            OK
          </button>
        </div>
      )}

      <div className="flex h-full overflow-visible transition-transform duration-[650ms] ease-[cubic-bezier(.65,0,.25,1)]" style={{ transform: `translateX(-${index * 100}%)` }}>
        <Slide active={step === 'welcome'}>
          <WelcomeStep onNext={() => setStep('profile')} onRestored={(summary) => void onRestored(summary)} />
        </Slide>
        <Slide active={step === 'profile'}>
          <ProfileStep active={step === 'profile'} onNext={() => setStep('games')} />
        </Slide>
        <Slide active={step === 'games'}>
          <GamesStep onStart={(mode) => void begin(mode)} />
        </Slide>
        <Slide active={step === 'scan'}>
          <ScanStep started={started} restored={restored} onFinish={() => void finish()} />
        </Slide>
      </div>

      <div className="absolute inset-x-0 bottom-9 flex justify-center gap-2" aria-hidden>
        {STEPS.map((item, dot) => (
          <span key={item} className={`h-2 rounded-full transition-all duration-500 ${dot === index ? 'w-8 bg-accent-bright' : dot < index ? 'w-2 bg-accent-bright/60' : 'w-2 bg-line'}`} />
        ))}
      </div>
    </div>
  )
}
