export type Direction = 'up' | 'down' | 'left' | 'right'
export type PadAction = Direction | 'accept' | 'back' | 'previous' | 'next'

export const DEAD_ZONE = 0.55
const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right']

/** Only the browser's standard mapping is safe to interpret as Xbox/PS buttons. */
export function readActions(pad: { buttons: readonly { pressed: boolean }[]; axes: readonly number[] }): Set<PadAction> {
  const pressed = (index: number) => pad.buttons[index]?.pressed === true
  const actions = new Set<PadAction>()
  if (pressed(0)) actions.add('accept')
  if (pressed(1)) actions.add('back')
  if (pressed(4)) actions.add('previous')
  if (pressed(5)) actions.add('next')
  const x = pad.axes[0] ?? 0
  const y = pad.axes[1] ?? 0
  // Use the dominant axis so diagonal stick input does not move twice per frame.
  if (pressed(12) || (y < -DEAD_ZONE && Math.abs(y) >= Math.abs(x))) actions.add('up')
  if (pressed(13) || (y > DEAD_ZONE && Math.abs(y) >= Math.abs(x))) actions.add('down')
  if (pressed(14) || (x < -DEAD_ZONE && Math.abs(x) > Math.abs(y))) actions.add('left')
  if (pressed(15) || (x > DEAD_ZONE && Math.abs(x) > Math.abs(y))) actions.add('right')
  return actions
}

/** Edge-trigger buttons; repeat only navigation. Seed on reconnect/blur to ignore held buttons. */
export class PadRepeater {
  private previous = new Set<PadAction>()
  private direction: Direction | undefined
  private repeatAt = 0

  seed(actions: Set<PadAction>): void {
    this.previous = new Set(actions)
    this.direction = undefined
    this.repeatAt = Infinity
  }

  update(actions: Set<PadAction>, now: number): PadAction | undefined {
    const edge = (['back', 'accept', 'previous', 'next'] as const).find((action) => actions.has(action) && !this.previous.has(action))
    const direction = DIRECTIONS.find((action) => actions.has(action))
    let move: Direction | undefined
    if (direction !== this.direction) {
      this.direction = direction
      this.repeatAt = now + 380
      if (direction && !this.previous.has(direction)) move = direction
      else if (direction) this.repeatAt = Infinity
    } else if (direction && now >= this.repeatAt) {
      move = direction
      this.repeatAt = now + 115
    }
    this.previous = new Set(actions)
    return edge ?? move
  }
}

export interface Box { left: number; right: number; top: number; bottom: number }

/** Spatial navigation follows the rendered layout, including grids and horizontal shelves. */
export function nextIndex(origin: Box, boxes: Box[], direction: Direction): number {
  const horizontal = direction === 'left' || direction === 'right'
  const sign = direction === 'left' || direction === 'up' ? -1 : 1
  const center = (box: Box) => horizontal ? (box.left + box.right) / 2 : (box.top + box.bottom) / 2
  const cross = (box: Box) => horizontal ? [box.top, box.bottom] : [box.left, box.right]
  const [start, end] = cross(origin) as [number, number]
  let best = -1
  let bestScore = Infinity
  let bestAligned = false
  boxes.forEach((box, index) => {
    const distance = (center(box) - center(origin)) * sign
    if (distance <= 1) return
    const [otherStart, otherEnd] = cross(box) as [number, number]
    const gap = Math.max(0, start - otherEnd, otherStart - end)
    const offset = Math.abs((otherStart + otherEnd - start - end) / 2)
    const aligned = otherStart < end && otherEnd > start
    const score = distance + gap * 4 + offset * 0.2
    // Stay in the row/column before considering diagonals, even for tall cover cards.
    if ((aligned && !bestAligned) || (aligned === bestAligned && score < bestScore)) {
      best = index
      bestScore = score
      bestAligned = aligned
    }
  })
  return best
}
