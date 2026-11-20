import { useEffect, useMemo, useState } from 'react'
import { formatHoursShort } from '../format'
import { computeProfileStats, formatTotalHours } from '@shared/profileStats'
import { startOver } from '../resetApp'
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
        <button type="button" onClick={() => void startOver()} disabled={busy} className="text-xs text-muted hover:text-danger">
          Delete profile and start over…
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

const MENU: { id: 'settings' | 'stats' | 'hardware'; label: string; hint: string; icon: string }[] = [
  { id: 'settings', label: 'Settings', hint: 'Skins, locations, backups and more', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' },
  { id: 'stats', label: 'Statistics', hint: 'Time per day and your most played games', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { id: 'hardware', label: 'My hardware', hint: 'Your gaming PC, part by part', icon: 'M4 5h16v11H4zM8 20h8M12 16v4M8 9h3v3H8z' }
]

function ProfileOverview({ onEdit }: { onEdit: () => void }) {
  const { profile, games, openProfile, setView } = useLauncher()
  const stats = useMemo(() => computeProfileStats(games), [games])

  function open(id: (typeof MENU)[number]['id']) {
    openProfile(false)
    if (id === 'settings') setView('settings')
    else if (id === 'stats') useLauncher.setState({ statsOpen: true })
    else useLauncher.setState({ hardwareOpen: true })
  }

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

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Your stats</h3>
          <button type="button" onClick={() => open('stats')} className="text-sm font-semibold text-accent-bright underline-offset-4 hover:underline">
            View
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Time played" value={formatTotalHours(stats.totalSeconds)} />
          <Stat label="Games played" value={String(stats.gamesPlayed)} />
          <Stat label="Play sessions" value={String(stats.sessions)} />
        </div>
      </section>

      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg bg-canvas">
        {MENU.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => open(item.id)} className="group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-raised">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-raised text-accent-bright group-hover:bg-surface">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={item.icon} />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{item.label}</span>
                <span className="block text-sm text-muted">{item.hint}</span>
              </span>
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
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
