import { nextIndex, type Direction } from '@shared/gamepad'

const SELECTOR = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex="0"]'

export function visible(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false
  const style = getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
}

export function controls(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(SELECTOR)].filter((element) =>
    !element.matches(':disabled, [aria-disabled="true"], [data-gamepad-skip]') && visible(element)
  )
}

/** Overlay priority is explicit: nested screenshots and confirmations cannot reach the page behind. */
export function activeScope(): HTMLElement {
  return [...document.querySelectorAll<HTMLElement>('[data-gamepad-scope]')]
    .filter(visible)
    .reduce((top, element) => Number(element.dataset.gamepadScope) >= Number(top.dataset.gamepadScope ?? 0) ? element : top, document.body)
}

export function focusControl(element: HTMLElement): void {
  element.focus({ preventScroll: true })
  element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
}

export function changeSelect(element: HTMLSelectElement, step: number): void {
  const options = [...element.options]
  let index = element.selectedIndex + step
  while (index >= 0 && index < options.length) {
    const option = options[index]!
    if (!option.disabled && !option.closest('optgroup[disabled]')) {
      element.selectedIndex = index
      element.dispatchEvent(new Event('change', { bubbles: true }))
      return
    }
    index += step
  }
}

/** Remember focus separately for each overlay so B returns to the game that opened it. */
export class FocusNavigator {
  private memory = new WeakMap<HTMLElement, HTMLElement>()

  ensure(): HTMLElement | undefined {
    const root = activeScope()
    const items = controls(root)
    const current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const remembered = this.memory.get(root)
    // A newly opened modal often focuses its container. Prefer its first action in that case.
    // An explicit mouse/keyboard focus change takes precedence over remembered focus.
    const target = current && items.includes(current) ? current
      : remembered && items.includes(remembered) ? remembered
      : items.find((item) => item.hasAttribute('data-gamepad-autofocus')) ?? items[0]
    if (target) {
      this.memory.set(root, target)
      if (target !== current) focusControl(target)
    }
    return target
  }

  move(direction: Direction): void {
    const current = this.ensure()
    if (!current) return
    // Up/down always leaves a select; left/right changes its value without opening native UI.
    if (current instanceof HTMLSelectElement && (direction === 'left' || direction === 'right')) {
      changeSelect(current, direction === 'left' ? -1 : 1)
      return
    }
    const items = controls(activeScope()).filter((item) => item !== current)
    const next = items[nextIndex(current.getBoundingClientRect(), items.map((item) => item.getBoundingClientRect()), direction)]
    if (next) {
      focusControl(next)
      this.memory.set(activeScope(), next)
    }
  }

  scroll(amount: number): void {
    const root = activeScope()
    let element: HTMLElement | null = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : root
    while (element && root.contains(element)) {
      if (/(auto|scroll)/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) {
        element.scrollBy({ top: amount, behavior: 'instant' })
        return
      }
      element = element.parentElement
    }
    root.querySelector<HTMLElement>('main')?.scrollBy({ top: amount, behavior: 'instant' })
  }
}
