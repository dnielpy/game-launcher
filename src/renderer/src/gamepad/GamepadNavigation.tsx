import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLauncher, type View } from '../store'
import { DEAD_ZONE, PadRepeater, readActions, type PadAction } from '@shared/gamepad'
import { activeScope, changeSelect, FocusNavigator } from './navigation'

const VIEWS: View[] = ['home', 'library', 'emulators', 'tools', 'settings']
type TextField = HTMLInputElement | HTMLTextAreaElement

function isTextField(element: HTMLElement): element is TextField {
  return element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement && ['text', 'search', 'password', 'email', 'url', 'tel', 'number'].includes(element.type)
}

/** Commit through the native setter so React's controlled inputs receive a normal edit. */
function writeField(field: TextField, value: string): void {
  if (!field.isConnected || field.disabled || field.readOnly) return
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value)
  field.dispatchEvent(new Event('input', { bubbles: true }))
  field.dispatchEvent(new Event('change', { bubbles: true }))
}

function PadKeyboard({ field, onClose }: { field: TextField; onClose: () => void }) {
  const [value, setValue] = useState(field.value)
  const [shift, setShift] = useState(false)
  const [symbols, setSymbols] = useState(false)
  const rows = symbols ? ['1234567890', '!@#$%^&*()', '-_=+[]{}', ';:\'",.<>/?', '\\|`~'] : ['1234567890', 'qwertyuiop', 'asdfghjklñ', 'zxcvbnm', 'áéíóúü']
  const append = (text: string) => setValue((previous) => field.maxLength < 0 ? previous + text : (previous + text).slice(0, field.maxLength))
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return createPortal(
    <div data-gamepad-scope="80" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-6">
      <section role="dialog" aria-modal="true" aria-label="On-screen keyboard" className="w-full max-w-3xl rounded-xl border border-line bg-surface p-6 shadow-2xl">
        <h2 className="mb-3 text-xl font-semibold">{field.getAttribute('aria-label') || field.labels?.[0]?.textContent || field.placeholder || 'Enter text'}</h2>
        <p className="mb-5 min-h-14 break-all rounded-md bg-canvas p-4 font-mono" aria-live={field.type === 'password' ? 'off' : 'polite'}>{field.type === 'password' ? '•'.repeat(value.length) : value || ' '}</p>
        <div className="flex flex-col gap-3">
          {rows.map((row) => <div key={row} className="flex justify-center gap-2">
            {[...row].map((char) => <button key={char} type="button" className="h-11 min-w-11 rounded-md bg-raised px-3 hover:bg-line" onClick={() => append(shift ? char.toUpperCase() : char)}>{shift ? char.toUpperCase() : char}</button>)}
          </div>)}
          <div className="flex justify-center gap-3">
            <button type="button" className="pad-key" aria-pressed={shift} onClick={() => setShift(!shift)}>Shift</button>
            <button type="button" className="pad-key" aria-pressed={symbols} onClick={() => setSymbols(!symbols)}>{symbols ? 'ABC' : '#+='}</button>
            <button type="button" className="pad-key flex-1" onClick={() => append(' ')}>Space</button>
            <button type="button" className="pad-key" onClick={() => setValue((previous) => [...previous].slice(0, -1).join(''))}>⌫ Delete</button>
            <button type="button" className="pad-key" onClick={() => setValue('')}>Clear</button>
          </div>
          <div className="mt-3 flex justify-end gap-3">
            <button type="button" data-gamepad-back className="pad-key" onClick={onClose}>Cancel</button>
            <button type="button" className="pad-key bg-accent text-white" onClick={() => { writeField(field, value); onClose() }}>Done</button>
          </div>
        </div>
      </section>
    </div>, document.body
  )
}

/** One poller for all skins, onboarding and overlays. Never sends synthetic keyboard events. */
export function GamepadNavigation() {
  const [status, setStatus] = useState<'none' | 'standard' | 'unsupported'>('none')
  const [usingPad, setUsingPad] = useState(false)
  const [field, setField] = useState<TextField | null>(null)

  useEffect(() => {
    if (!navigator.getGamepads) return
    const navigatorFocus = new FocusNavigator()
    const repeater = new PadRepeater()
    let frame = 0
    let padKey = ''
    let previousStatus = 'none'
    let mode = false
    let lastTime = 0
    let lastRepair = 0
    let suspended = true

    const setMode = (active: boolean) => {
      if (mode === active) return
      mode = active
      document.documentElement.toggleAttribute('data-gamepad', active)
      setUsingPad(active)
    }
    const otherInput = () => setMode(false)

    const handle = (action: PadAction) => {
      setMode(true)
      const element = navigatorFocus.ensure()
      const root = activeScope()
      if (action === 'back') {
        const back = root.querySelector<HTMLElement>('[data-gamepad-back]')
        if (back) back.click()
        else if (root === document.body) {
          const state = useLauncher.getState()
          if (state.view === 'settings' && state.settingsModule) state.openSettings(null)
          else if (state.app?.onboardingDone) state.setView('home')
        }
      } else if (action === 'accept') {
        if (!element) return
        if (isTextField(element)) {
          if (!element.readOnly) setField(element)
        } else if (element instanceof HTMLSelectElement) changeSelect(element, 1)
        else element.click()
      } else if (action === 'previous' || action === 'next') {
        const state = useLauncher.getState()
        if (root !== document.body || !state.app?.onboardingDone) return
        const index = VIEWS.indexOf(state.view)
        state.setView(VIEWS[(index + (action === 'next' ? 1 : VIEWS.length - 1)) % VIEWS.length]!)
      } else navigatorFocus.move(action)
    }

    const poll = (now: number) => {
      frame = requestAnimationFrame(poll)
      const elapsed = Math.min(50, now - lastTime)
      lastTime = now
      let pads: Gamepad[]
      try { pads = [...navigator.getGamepads()].filter((pad): pad is Gamepad => pad !== null && pad.connected) }
      catch { return }
      const supported = pads.filter((pad) => pad.mapping === 'standard')
      // A second controller can take over by pressing a control; idle devices do not interfere.
      const pad = supported.find((item) => readActions(item).size > 0 || Math.abs(item.axes[3] ?? 0) > DEAD_ZONE)
        ?? supported.find((item) => `${item.index}:${item.id}` === padKey) ?? supported[0]
      const nextStatus = pad ? 'standard' : pads.length ? 'unsupported' : 'none'
      if (nextStatus !== previousStatus) { previousStatus = nextStatus; setStatus(nextStatus) }
      if (!pad) { padKey = ''; suspended = true; setMode(false); return }
      const actions = readActions(pad)
      const key = `${pad.index}:${pad.id}`
      if (document.hidden || !document.hasFocus()) {
        repeater.seed(actions)
        suspended = true
        return
      }
      if (suspended || padKey !== key) {
        repeater.seed(actions)
        padKey = key
        suspended = false
        return
      }
      const action = repeater.update(actions, now)
      if (action) handle(action)
      const scroll = pad.axes[3] ?? 0
      if (Math.abs(scroll) > DEAD_ZONE) {
        setMode(true)
        navigatorFocus.scroll(scroll * elapsed * 1.1)
      }
      // Repair focus after React opens/closes an overlay or replaces a view.
      if (mode && now - lastRepair > 120) { navigatorFocus.ensure(); lastRepair = now }
    }
    frame = requestAnimationFrame(poll)
    window.addEventListener('pointerdown', otherInput, true)
    window.addEventListener('pointermove', otherInput, true)
    window.addEventListener('keydown', otherInput, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointerdown', otherInput, true)
      window.removeEventListener('pointermove', otherInput, true)
      window.removeEventListener('keydown', otherInput, true)
      document.documentElement.removeAttribute('data-gamepad')
    }
  }, [])

  return <>
    {status !== 'none' && <div className="pointer-events-none fixed bottom-2 right-3 z-[90] max-w-[95vw] rounded-md bg-black/85 px-3 py-2 text-xs text-white shadow-lg" role="status">
      {status === 'unsupported' ? 'Controller detected — enable Xbox / XInput mode to navigate.' : usingPad
        ? 'D-pad / L stick: move · A / ×: select · B / ○: back · LB / RB: sections · R stick: scroll'
        : 'Controller ready · Press a button to navigate'}
    </div>}
    {field && <PadKeyboard field={field} onClose={() => setField(null)} />}
  </>
}
