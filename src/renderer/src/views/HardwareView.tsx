import { useEffect, useRef, useState } from 'react'
import type { HardwareInfo } from '@shared/types'
import { WindowControls } from '../components/WindowControls'
import { formatBytes } from '../format'
import type { PcPart, PcScene } from '../hardware/pcScene'
import { useLauncher } from '../store'

const PART_NAMES: Record<PcPart, string> = {
  gpu: 'Graphics card',
  cpu: 'Processor',
  ram: 'Memory',
  motherboard: 'Motherboard',
  storage: 'Storage'
}
const PART_ORDER: PcPart[] = ['gpu', 'cpu', 'ram', 'motherboard', 'storage']

interface Spec {
  title: string
  subtitle?: string
  rows: [string, string][]
}

const gb = (bytes: number) => `${Math.round(bytes / 1024 ** 3)} GB`

/** What to show for each part, from what Windows reported. One entry per physical item (several disks, several cards). */
function specsFor(part: PcPart, hardware: HardwareInfo | null): Spec[] {
  if (!hardware) return [{ title: 'Reading your PC…', rows: [] }]
  const unknown: Spec[] = [{ title: 'Not reported', subtitle: 'Windows did not share details about this part.', rows: [] }]
  switch (part) {
    case 'cpu':
      if (!hardware.cpu) return unknown
      return [
        {
          title: hardware.cpu.name,
          rows: [
            ...(hardware.cpu.cores ? ([['Cores', String(hardware.cpu.cores)]] as [string, string][]) : []),
            ...(hardware.cpu.threads ? ([['Threads', String(hardware.cpu.threads)]] as [string, string][]) : []),
            ...(hardware.cpu.maxClockMhz ? ([['Base clock', `${(hardware.cpu.maxClockMhz / 1000).toFixed(2)} GHz`]] as [string, string][]) : [])
          ]
        }
      ]
    case 'gpu':
      if (hardware.gpus.length === 0) return unknown
      return hardware.gpus.map((gpu) => ({
        title: gpu.name,
        rows: [
          ...(gpu.vramBytes ? ([['Video memory', gb(gpu.vramBytes)]] as [string, string][]) : []),
          ...(gpu.driver ? ([['Driver', gpu.driver]] as [string, string][]) : [])
        ]
      }))
    case 'ram': {
      const modules = hardware.memory.modules.filter((module) => module.capacityBytes > 0)
      const speed = modules.find((module) => module.speedMhz)?.speedMhz
      const maker = modules.find((module) => module.manufacturer && !/^unknown$/i.test(module.manufacturer))?.manufacturer
      return [
        {
          title: `${gb(hardware.memory.totalBytes)} RAM`,
          subtitle: modules.length > 0 ? `${modules.length} × ${gb(modules[0]!.capacityBytes)}` : undefined,
          rows: [
            ...(speed ? ([['Speed', `${speed} MT/s`]] as [string, string][]) : []),
            ...(maker ? ([['Made by', maker]] as [string, string][]) : []),
            ...(modules[0]?.partNumber ? ([['Part number', modules[0].partNumber]] as [string, string][]) : [])
          ]
        }
      ]
    }
    case 'motherboard':
      if (!hardware.motherboard?.product) return unknown
      return [
        {
          title: hardware.motherboard.product,
          rows: [...(hardware.motherboard.manufacturer ? ([['Made by', hardware.motherboard.manufacturer]] as [string, string][]) : []), ...(hardware.os ? ([['System', hardware.os]] as [string, string][]) : [])]
        }
      ]
    case 'storage':
      if (hardware.disks.length === 0) return unknown
      return hardware.disks.map((disk) => ({
        title: disk.model,
        rows: [
          ['Capacity', formatBytes(disk.sizeBytes)],
          ...(disk.mediaType || disk.busType ? ([['Type', [disk.busType, disk.mediaType].filter(Boolean).join(' ')]] as [string, string][]) : [])
        ]
      }))
  }
}

/** Shown when WebGL is not available: the same details, without the 3D PC. */
function useWebGl(): boolean {
  const [ok] = useState(() => {
    try {
      const canvas = document.createElement('canvas')
      return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
    } catch {
      return false
    }
  })
  return ok
}

/** My hardware: a 3D gaming PC to turn around and click, with the real specs of this PC. */
export function HardwareView() {
  const { hardwareOpen, hardware, loadHardware } = useLauncher()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<PcScene | null>(null)
  const [selected, setSelected] = useState<PcPart | null>(null)
  const [hover, setHover] = useState<{ part: PcPart; x: number; y: number } | null>(null)
  const webgl = useWebGl()
  const close = () => useLauncher.setState({ hardwareOpen: false })

  useEffect(() => {
    if (hardwareOpen) void loadHardware()
  }, [hardwareOpen, loadHardware])

  useEffect(() => {
    if (!hardwareOpen || !webgl || !canvasRef.current) return
    let disposed = false
    let scene: PcScene | null = null
    // three.js loads only when this screen opens.
    void import('../hardware/pcScene').then(({ createPcScene }) => {
      if (disposed || !canvasRef.current) return
      scene = createPcScene(canvasRef.current, {
        onHover: (part, x, y) => setHover(part ? { part, x, y } : null),
        onSelect: (part) => setSelected(part)
      })
      sceneRef.current = scene
    })
    const onResize = () => sceneRef.current?.resize()
    window.addEventListener('resize', onResize)
    return () => {
      disposed = true
      window.removeEventListener('resize', onResize)
      scene?.dispose()
      sceneRef.current = null
      setSelected(null)
    }
  }, [hardwareOpen, webgl])

  useEffect(() => {
    sceneRef.current?.focus(selected)
  }, [selected])

  useEffect(() => {
    if (!hardwareOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (selected) setSelected(null)
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hardwareOpen, selected])

  if (!hardwareOpen) return null
  const specs = selected ? specsFor(selected, hardware) : []

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-[radial-gradient(70%_70%_at_60%_45%,#1d1d20,#0a0a0b_75%)] motion-safe:animate-[fade-in_300ms_ease-out]">
      {webgl ? (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing" aria-label="3D model of a gaming PC. Drag to turn it, click a part to see its details." />
      ) : (
        <p className="absolute inset-x-0 top-1/2 text-center text-muted">3D is not available on this PC. Pick a part below to see its details.</p>
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/75 via-black/35 to-transparent px-10 pb-16 pt-8">
        <div>
          <h1 className="font-display text-4xl font-semibold">My hardware</h1>
          <p className="mt-1 text-sm text-muted">{hardware?.cpu?.name ?? 'Reading your PC…'}</p>
        </div>
        <div className="pointer-events-auto flex items-center gap-3">
          <button type="button" onClick={close} className="flex h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-sm backdrop-blur hover:bg-white/20" aria-label="Close My hardware">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            Close
          </button>
          <WindowControls />
        </div>
      </header>

      {/* Details of the selected part slide in on the left. */}
      <aside
        className={`absolute bottom-28 left-10 top-32 w-[360px] transition-[transform,opacity] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${selected ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-8 opacity-0'}`}
        aria-live="polite"
      >
        {selected && (
          <div key={selected} className="flex max-h-full flex-col gap-4 overflow-y-auto rounded-2xl border border-white/10 bg-black/55 p-6 backdrop-blur-xl motion-safe:animate-[rise-in_400ms_cubic-bezier(.2,.8,.2,1)_both]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-bright">{PART_NAMES[selected]}</span>
              <button type="button" onClick={() => setSelected(null)} className="text-sm text-muted hover:text-ink">
                Back
              </button>
            </div>
            {specs.map((spec, index) => (
              <div key={`${spec.title}-${index}`} className={index > 0 ? 'border-t border-white/10 pt-4' : ''}>
                <h2 className="font-display text-2xl font-semibold leading-tight">{spec.title}</h2>
                {spec.subtitle && <p className="mt-1 text-sm text-muted">{spec.subtitle}</p>}
                {spec.rows.length > 0 && (
                  <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
                    {spec.rows.map(([label, value]) => (
                      <div key={label} className="contents">
                        <dt className="text-muted">{label}</dt>
                        <dd className="break-words">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            ))}
          </div>
        )}
      </aside>

      {hover && !selected && (
        <div className="pointer-events-none fixed z-50 rounded-md bg-black/80 px-3 py-1.5 text-sm font-semibold backdrop-blur" style={{ left: hover.x + 16, top: hover.y + 12 }}>
          {PART_NAMES[hover.part]}
        </div>
      )}

      <nav className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-3" aria-label="Parts">
        <div className="flex gap-2 rounded-full border border-white/10 bg-black/45 p-1.5 backdrop-blur">
          {PART_ORDER.map((part) => (
            <button
              key={part}
              type="button"
              onClick={() => setSelected(selected === part ? null : part)}
              aria-pressed={selected === part}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${selected === part ? 'bg-accent-bright font-semibold text-black' : 'text-ink/75 hover:bg-white/10 hover:text-ink'}`}
            >
              {PART_NAMES[part]}
            </button>
          ))}
        </div>
        <p className="text-xs text-white/40">Drag to turn · Scroll to zoom · Click a part · Esc to go back</p>
      </nav>
    </div>
  )
}
