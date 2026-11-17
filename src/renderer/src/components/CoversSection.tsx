import { useState } from 'react'
import type { SettingsState } from '@shared/types'
import { errorMessage, useLauncher } from '../store'

function KeyForm({
  label,
  saved,
  linkLabel,
  linkUrl,
  save
}: {
  label: string
  saved: boolean
  linkLabel: string
  linkUrl: string
  save: (key: string | null) => Promise<SettingsState>
}) {
  const { setError, setSettings } = useLauncher()
  const [key, setKey] = useState('')
  const [done, setDone] = useState(false)

  async function submit(value: string | null) {
    try {
      setSettings(await save(value))
      setKey('')
      setDone(value !== null)
    } catch (error) {
      setError(errorMessage(error))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (key.trim()) void submit(key.trim())
        }}
      >
        <input
          type="password"
          value={key}
          onChange={(event) => {
            setKey(event.target.value)
            setDone(false)
          }}
          placeholder={saved ? `A ${label} key is saved` : `${label} API key`}
          aria-label={`${label} API key`}
          className="flex-1 rounded-md border border-line bg-canvas px-3 py-2 text-sm outline-none placeholder:text-muted/70 focus:border-accent-bright"
          autoComplete="off"
        />
        <button type="submit" disabled={key.trim().length === 0} className="rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-bright hover:text-black disabled:opacity-40">
          Save key
        </button>
      </form>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={() => void window.api.openExternal(linkUrl)} className="text-accent-bright underline-offset-4 hover:underline">
          {linkLabel}
        </button>
        {saved && (
          <button type="button" onClick={() => void submit(null)} className="text-muted hover:text-danger">
            Remove key
          </button>
        )}
      </div>
      {done && <p className="text-sm text-accent-bright">Key saved. Games without details are being looked up again.</p>}
    </div>
  )
}

/** Settings module: where covers and details come from, and the optional keys for games that are not on Steam. */
export function CoversSection() {
  const settings = useLauncher((state) => state.settings)

  return (
    <section className="flex flex-col gap-6 rounded-lg bg-surface px-6 py-5">
      <div>
        <h2 className="text-lg font-semibold">Covers and game details</h2>
        <p className="mt-1 text-sm text-muted">
          PC games get box art, banners, descriptions and ratings from the Steam store, with no setup. Two free keys cover everything else, Nintendo Switch games included.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">RAWG: descriptions, release dates, genres and ratings</h3>
        <KeyForm
          label="RAWG"
          saved={settings?.hasRawgKey === true}
          linkLabel="Get a free key at rawg.io"
          linkUrl="https://rawg.io/apidocs"
          save={(key) => window.api.settings.setRawgKey(key)}
        />
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-5">
        <h3 className="text-sm font-semibold">SteamGridDB: vertical covers, banners and logos</h3>
        <KeyForm
          label="SteamGridDB"
          saved={settings?.hasSteamGridDbKey === true}
          linkLabel="Get a free key at steamgriddb.com"
          linkUrl="https://www.steamgriddb.com/profile/preferences/api"
          save={(key) => window.api.settings.setSteamGridDbKey(key)}
        />
      </div>
    </section>
  )
}
