import { useEffect, useMemo, useState } from 'react'
import { formatHoursShort } from '../format'
import { computeProfileStats, formatTotalHours } from '@shared/profileStats'
import { errorMessage, useLauncher } from '../store'
import { Avatar } from './Avatar'
import { Cover } from './GameArt'

function ProfileForm({ onDone }: { onDone: () => void }) {
  const { profile, setProfile, setError } = useLauncher()
  const [name, setName] = useState(profile?.name ?? '')
  const [busy, setBusy] = useState(false)
  const editing = profile?.created === true

  async function run(task: () => Promise<void>) {
    setBusy(true)
    try {
      await task()
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const choosePhoto = () =>
    run(async () => {
      const next = await window.api.profile.choosePhoto()
      if (next) setProfile(next)
    })
  const removePhoto = () => run(async () => setProfile(await window.api.profile.removePhoto()))
  const save = () =>
    run(async () => {
      setProfile(await window.api.profile.save(name))
      onDone()
    })
  const remove = () =>
    run(async () => {
      setProfile(await window.api.profile.remove())
      setName('')
      onDone()
    })

  return (
    <form
      className="flex flex-col items-center gap-6 px-8 py-10"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim()) void save()
      }}
    >
      <div className="text-center">
        <h2 className="font-display text-2xl font-semibold">{editing ? 'Edit your profile' : 'Create your profile'}</h2>
        <p className="mt-2 max-w-sm text-sm text-muted">No account needed. Your name and photo stay on this PC, and they are included when you export your data.</p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button type="button" onClick={() => void choosePhoto()} disabled={busy} className="group relative rounded-full" aria-label="Choose a photo">
          <Avatar profile={{ created: name.trim().length > 0, name, avatarFile: profile?.avatarFile ?? null }} className="h-28 w-28" textClass="text-5xl" />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-sm font-semibold opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {profile?.avatarFile ? 'Change photo' : 'Add photo'}
          </span>
        </button>
        {profile?.avatarFile && (
          <button type="button" onClick={() => void removePhoto()} disabled={busy} className="text-xs text-muted hover:text-ink">
            Remove photo
          </button>
        )}
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        <label htmlFor="profile-name" className="text-sm font-semibold">
          Your name
        </label>
        <input
          id="profile-name"
          value={name}
          maxLength={40}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          placeholder="What should we call you?"
          className="rounded-md border border-line bg-canvas px-3 py-2.5 text-sm outline-none placeholder:text-muted/60 focus:border-accent-bright"
        />
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || name.trim().length === 0} className="rounded-md bg-accent px-7 py-2.5 font-semibold text-white enabled:hover:bg-accent-bright enabled:hover:text-black disabled:opacity-50">
          {editing ? 'Save' : 'Create profile'}
        </button>
        {editing && (
          <button type="button" onClick={onDone} className="rounded-md bg-raised px-5 py-2.5 text-sm hover:bg-line">
            Cancel
          </button>
        )}
      </div>
      {editing && (
        <button type="button" onClick={() => void remove()} disabled={busy} className="text-xs text-muted hover:text-danger">
          Delete profile (your play history stays)
        </button>
      )}
    </form>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-canvas px-5 py-4 text-center">
      <div className="whitespace-nowrap font-display text-3xl font-semibold leading-none">{value}</div>
      <div className="mt-2 text-xs text-muted">{label}</div>
    </div>
  )
}

function ProfileOverview({ onEdit }: { onEdit: () => void }) {
  const { profile, games, select, openProfile } = useLauncher()
  const stats = useMemo(() => computeProfileStats(games), [games])
  const top = stats.ranking[0]?.playtimeSeconds ?? 1

  return (
    <div className="flex flex-col gap-7 px-8 py-8">
      <div className="flex items-center gap-5">
        <Avatar profile={profile} className="h-20 w-20" textClass="text-3xl" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-3xl font-semibold">{profile?.name}</h2>
          <p className="text-sm text-muted">Your stats on this PC</p>
        </div>
        <button type="button" onClick={onEdit} className="rounded-md bg-raised px-4 py-2 text-sm hover:bg-line">
          Edit profile
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Time played" value={formatTotalHours(stats.totalSeconds)} />
        <Stat label="Games played" value={String(stats.gamesPlayed)} />
        <Stat label="Play sessions" value={String(stats.sessions)} />
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Most played games</h3>
        {stats.ranking.length === 0 ? (
          <p className="rounded-md bg-canvas px-4 py-6 text-center text-sm text-muted">Nothing here yet. Start a game from Orus and your hours show up here.</p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {stats.ranking.map((game, index) => (
              <li key={game.id}>
                <button
                  type="button"
                  onClick={() => {
                    openProfile(false)
                    select(game.id)
                  }}
                  className="flex w-full items-center gap-4 rounded-md bg-canvas px-3 py-2 text-left hover:bg-raised"
                >
                  <span className={`w-6 text-center font-display text-lg font-semibold ${index === 0 ? 'text-accent-bright' : 'text-muted'}`}>{index + 1}</span>
                  <span className="h-12 w-8 shrink-0 overflow-hidden rounded-sm">
                    <Cover game={game} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm">{game.title}</span>
                      <span className="shrink-0 text-sm text-muted">{formatHoursShort(game.playtimeSeconds)}</span>
                    </span>
                    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-raised">
                      <span className="block h-full rounded-full bg-accent-bright" style={{ width: `${Math.max(3, (game.playtimeSeconds / top) * 100)}%` }} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

export function ProfileModal() {
  const { profile, profileOpen, openProfile } = useLauncher()
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!profileOpen) return
    setEditing(false)
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && openProfile(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [profileOpen, openProfile])

  if (!profileOpen) return null
  const showForm = editing || !profile?.created

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" onClick={() => openProfile(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profile"
        onClick={(event) => event.stopPropagation()}
        className="relative max-h-[90vh] w-full max-w-[640px] overflow-y-auto rounded-xl bg-surface shadow-[0_30px_120px_rgba(0,0,0,0.6)]"
      >
        <button type="button" onClick={() => openProfile(false)} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-lg hover:bg-black/70" aria-label="Close">
          ✕
        </button>
        {showForm ? <ProfileForm onDone={() => setEditing(false)} /> : <ProfileOverview onEdit={() => setEditing(true)} />}
      </div>
    </div>
  )
}
