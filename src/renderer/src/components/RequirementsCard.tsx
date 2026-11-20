import { useEffect, useState } from 'react'
import type { Game, GameRequirements, RequirementItem } from '@shared/types'
import { checkCompatibility, type Verdict } from '@shared/compatibility'
import { useLauncher } from '../store'

const VERDICTS: Record<Verdict, { title: string; text: string; tone: string; icon: string }> = {
  good: {
    title: 'Your PC runs it well',
    text: 'It meets or comes close to the recommended specs.',
    tone: 'border-[#3fbf3f]/50 bg-[#3fbf3f]/12',
    icon: 'M5 12.5l4.5 4.5L19 7.5'
  },
  ok: {
    title: 'Your PC can run it',
    text: 'It meets the minimum specs. Expect lower settings.',
    tone: 'border-[#e0a400]/50 bg-[#e0a400]/12',
    icon: 'M12 8v5M12 16.5h.01'
  },
  bad: {
    title: 'Your PC may struggle',
    text: 'Some parts are below the minimum specs.',
    tone: 'border-[#e5484d]/55 bg-[#e5484d]/12',
    icon: 'M7 7l10 10M17 7L7 17'
  },
  unknown: {
    title: 'System requirements',
    text: 'Orus could not compare these with your PC.',
    tone: 'border-line bg-canvas',
    icon: 'M12 8h.01M12 11v5'
  }
}

const DOT: Record<Verdict, string> = { good: 'bg-[#3fbf3f]', ok: 'bg-[#e0a400]', bad: 'bg-[#e5484d]', unknown: 'bg-muted' }
const ICON_BG: Record<Verdict, string> = { good: 'bg-[#3fbf3f] text-black', ok: 'bg-[#e0a400] text-black', bad: 'bg-[#e5484d] text-white', unknown: 'bg-raised text-ink' }

function RequirementList({ title, items }: { title: string; items: RequirementItem[] | null }) {
  if (!items) return null
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h4>
      <dl className="flex flex-col gap-1.5 text-xs leading-relaxed">
        {items.map((item) => (
          <div key={`${item.label}-${item.value}`}>
            <dt className="inline text-muted">{item.label}: </dt>
            <dd className="inline">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Minimum and recommended specs, in a card colored by how this PC compares: green, yellow or red. */
export function RequirementsCard({ game }: { game: Game }) {
  const { hardware, loadHardware } = useLauncher()
  const [requirements, setRequirements] = useState<GameRequirements | null | undefined>(game.metadata?.requirements)

  useEffect(() => {
    void loadHardware()
  }, [loadHardware])

  useEffect(() => {
    setRequirements(game.metadata?.requirements)
    if (game.metadata && game.metadata.requirements === undefined && game.platform === 'pc') {
      void window.api.metadata.requirements(game.id).then(setRequirements)
    }
  }, [game.id, game.metadata, game.platform])

  if (game.platform !== 'pc' || !requirements || (!requirements.minimum && !requirements.recommended)) return null
  const result = checkCompatibility(requirements, hardware)
  const verdict = VERDICTS[result.overall]

  return (
    <section className={`flex flex-col gap-4 rounded-lg border p-4 ${verdict.tone}`} aria-label="System requirements">
      <div className="flex items-start gap-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ICON_BG[result.overall]}`}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={verdict.icon} />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="font-semibold leading-tight">{hardware ? verdict.title : 'System requirements'}</div>
          <div className="mt-0.5 text-xs text-muted">{hardware ? verdict.text : 'Checking your PC…'}</div>
        </div>
      </div>

      {hardware && result.parts.some((part) => part.verdict !== 'unknown') && (
        <ul className="flex flex-col gap-1.5 text-xs">
          {result.parts
            .filter((part) => part.verdict !== 'unknown')
            .map((part) => (
              <li key={part.part} className="flex items-start gap-2">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT[part.verdict]}`} />
                <span className="min-w-0">
                  <span className="text-muted">{part.label}: </span>
                  {part.yours}
                  <span className="text-muted"> · {part.verdict === 'good' ? 'recommended' : part.verdict === 'ok' ? 'minimum' : 'below minimum'}</span>
                </span>
              </li>
            ))}
        </ul>
      )}

      <RequirementList title="Minimum" items={requirements.minimum} />
      <RequirementList title="Recommended" items={requirements.recommended} />
    </section>
  )
}
