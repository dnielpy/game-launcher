import { useEffect, useState } from 'react'
import type { SettingsState } from '@shared/types'
import { LocationsSection } from '../components/LocationsSection'
import { UpdatesSection } from '../components/UpdatesSection'
import { errorMessage, useLauncher } from '../store'

export function SettingsView() {
  const setError = useLauncher((state) => state.setError)
  const [settings, setSettings] = useState<SettingsState | null>(null)
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void window.api.settings.get().then(setSettings)
  }, [])

  async function save(value: string | null) {
    try {
      setSettings(await window.api.settings.setRawgKey(value))
      setKey('')
      setSaved(value !== null)
    } catch (error) {
      setError(errorMessage(error))
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6 pb-10">
      <h1 className="font-display text-3xl font-semibold">Settings</h1>

      <UpdatesSection />

      <LocationsSection />

      <section className="flex flex-col gap-3 rounded-lg bg-surface px-6 py-5">
        <h2 className="text-lg font-semibold">Covers and game details</h2>
        <p className="text-sm text-muted">
          Box art, banners, descriptions and ratings come from the Steam store, which needs no setup. For games that are not on Steam, add a free RAWG key.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (key.trim()) void save(key.trim())
          }}
        >
          <input
            type="password"
            value={key}
            onChange={(event) => {
              setKey(event.target.value)
              setSaved(false)
            }}
            placeholder={settings?.hasRawgKey ? 'A RAWG key is saved' : 'RAWG API key'}
            className="flex-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm outline-none placeholder:text-muted/70 focus:border-accent-bright"
            autoComplete="off"
          />
          <button type="submit" disabled={key.trim().length === 0} className="rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-bright hover:text-black disabled:opacity-40">
            Save key
          </button>
        </form>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => void window.api.openExternal('https://rawg.io/apidocs')}
            className="text-accent-bright underline-offset-4 hover:underline"
          >
            Get a free key at rawg.io
          </button>
          {settings?.hasRawgKey && (
            <button type="button" onClick={() => void save(null)} className="text-muted hover:text-danger">
              Remove key
            </button>
          )}
        </div>
        {saved && <p className="text-sm text-accent-bright">Key saved. Games without details are being looked up again.</p>}
      </section>
    </div>
  )
}
