import { OrusMark } from './OrusMark'
import { useLauncher } from '../store'

export const DEVELOPER = 'dnielpy'
export const CONTACT_EMAIL = 'dnielquesada@gmail.com'
export const REPOSITORY_URL = 'https://github.com/dnielpy/game-launcher'

/** Settings module: version, author and contact. */
export function AboutSection() {
  const version = useLauncher((state) => state.update?.currentVersion)

  return (
    <section className="flex flex-col items-center gap-6 rounded-lg bg-surface px-6 py-10 text-center">
      <OrusMark className="h-20 w-20" />
      <div>
        <h2 className="font-display text-3xl font-semibold">Orus</h2>
        <p className="mt-1 text-sm text-muted">Version {version ?? 'unknown'}</p>
      </div>
      <p className="max-w-md text-sm text-muted">Your local game library: finds the games on your PC, shows them with box art and details, and counts the hours you play.</p>
      <dl className="grid w-full max-w-sm grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-left text-sm">
        <dt className="text-muted">Developed by</dt>
        <dd>{DEVELOPER}</dd>
        <dt className="text-muted">Contact</dt>
        <dd>
          <button type="button" onClick={() => void window.api.openExternal(`mailto:${CONTACT_EMAIL}`)} className="text-accent-bright underline-offset-4 hover:underline">
            {CONTACT_EMAIL}
          </button>
        </dd>
        <dt className="text-muted">Source code</dt>
        <dd>
          <button type="button" onClick={() => void window.api.openExternal(REPOSITORY_URL)} className="text-accent-bright underline-offset-4 hover:underline">
            github.com/dnielpy/game-launcher
          </button>
        </dd>
      </dl>
      <p className="text-xs text-muted">Game details and images come from the Steam store and RAWG.</p>
    </section>
  )
}
