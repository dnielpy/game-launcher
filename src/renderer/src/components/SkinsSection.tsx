import { flushSync } from 'react-dom'
import type { SkinId } from '@shared/types'
import { errorMessage, useLauncher } from '../store'

interface SkinInfo {
  id: SkinId
  name: string
  description: string
}

const SKINS: SkinInfo[] = [
  { id: 'orus', name: 'Orus', description: 'The original. Sidebar on the left, a big banner and rows of covers.' },
  { id: 'cinema', name: 'Cinema', description: 'Full-screen art for one game at a time and a shelf of covers. Made for the couch: arrows and Enter.' },
  { id: 'mosaic', name: 'Mosaic', description: 'Light and airy. An icon rail and a Home made of tiles, with your playtime at a glance.' }
]

/** Small drawings of each layout, in that skin's own colors. */
function Preview({ id }: { id: SkinId }) {
  if (id === 'cinema') {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[#0b0d12]">
        <div className="absolute inset-0 bg-[radial-gradient(80%_90%_at_75%_25%,#7a4a14,#0b0d12_70%)]" />
        <div className="absolute left-3 right-3 top-2.5 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#f5a524]" />
          <span className="h-1 w-6 rounded bg-white/80" />
          <span className="h-1 w-6 rounded bg-white/30" />
          <span className="h-1 w-6 rounded bg-white/30" />
          <span className="ml-auto h-3 w-3 rounded-full bg-white/40" />
        </div>
        <div className="absolute left-4 top-[24%] flex flex-col gap-1.5">
          <span className="h-3 w-24 rounded-sm bg-white/90" />
          <span className="h-1 w-16 rounded bg-white/40" />
          <span className="mt-1 h-3.5 w-12 rounded-full bg-[#f5a524]" />
        </div>
        <div className="absolute bottom-3 left-4 flex items-end gap-1.5">
          <span className="h-12 w-8 rounded-[3px] bg-[#c9783a] ring-2 ring-[#f5a524]" />
          {[0, 1, 2, 3, 4].map((index) => (
            <span key={index} className="h-9 w-6 rounded-[3px] bg-white/25" />
          ))}
        </div>
      </div>
    )
  }
  if (id === 'mosaic') {
    return (
      <div className="flex h-full w-full bg-[#eceef3]">
        <div className="flex w-6 flex-col items-center gap-1.5 bg-white py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#4f4fd1]" />
          <span className="mt-1 h-2.5 w-2.5 rounded bg-[#4f4fd1]/25" />
          <span className="h-2.5 w-2.5 rounded bg-[#d6dae3]" />
          <span className="h-2.5 w-2.5 rounded bg-[#d6dae3]" />
        </div>
        <div className="grid flex-1 grid-cols-6 grid-rows-4 gap-1.5 p-2.5">
          <span className="col-span-4 row-span-3 rounded-md bg-gradient-to-br from-[#5aa1c9] to-[#24425e]" />
          <span className="col-span-2 row-span-3 rounded-md bg-gradient-to-br from-[#4f4fd1] to-[#2a2a8f]" />
          <span className="col-span-2 rounded-md bg-white" />
          <span className="col-span-2 rounded-md bg-white" />
          <span className="col-span-2 rounded-md bg-white" />
        </div>
      </div>
    )
  }
  return (
    <div className="flex h-full w-full bg-[#16181b]">
      <div className="flex w-10 flex-col gap-1.5 bg-[#1f2226] px-1.5 py-2.5">
        <span className="h-2 w-6 rounded bg-[#3fbf3f]" />
        <span className="mt-1 h-1.5 w-full rounded bg-white/30" />
        <span className="h-1.5 w-full rounded bg-white/15" />
        <span className="h-1.5 w-full rounded bg-white/15" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <span className="h-[46%] rounded-md bg-gradient-to-r from-[#1d3b2a] to-[#3a6c4a]" />
        <div className="flex gap-1.5">
          {[0, 1, 2, 3, 4].map((index) => (
            <span key={index} className={`h-10 flex-1 rounded-[3px] ${index === 0 ? 'bg-[#3fbf3f]/70' : 'bg-white/15'}`} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Settings module: pick the skin. It changes at once, with a short cross-fade. */
export function SkinsSection() {
  const { skin, setSkin, setError } = useLauncher()

  function choose(next: SkinId) {
    if (next === skin) return
    const apply = () =>
      flushSync(() => {
        setSkin(next).catch((error: unknown) => setError(errorMessage(error)))
      })
    const doc = document as Document & { startViewTransition?: (callback: () => void) => unknown }
    if (doc.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(apply)
    else apply()
  }

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-2xl font-semibold">Skins</h2>
        <p className="mt-1 text-sm text-muted">Change the whole look of Orus. Your library, hours and settings stay the same.</p>
      </div>
      <div className="grid grid-cols-3 gap-4" role="radiogroup" aria-label="Skin">
        {SKINS.map((item) => {
          const active = item.id === skin
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(item.id)}
              className={`group flex flex-col overflow-hidden rounded-xl bg-surface text-left transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 ${
                active ? 'shadow-[0_0_0_2px_var(--color-accent-bright)]' : 'shadow-[0_0_0_1px_var(--color-line)] hover:shadow-[0_0_0_1px_var(--color-muted)]'
              }`}
            >
              <span className="block aspect-[16/10] w-full overflow-hidden">
                <span className="block h-full w-full transition-transform duration-500 group-hover:scale-[1.04]">
                  <Preview id={item.id} />
                </span>
              </span>
              <span className="flex flex-col gap-1 px-4 py-3.5">
                <span className="flex items-center justify-between font-semibold">
                  {item.name}
                  {active && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-bright text-black">
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    </span>
                  )}
                </span>
                <span className="text-xs leading-relaxed text-muted">{item.description}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
