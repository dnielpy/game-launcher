import { describe, expect, it } from 'vitest'
import { DEAD_ZONE, nextIndex, PadRepeater, readActions, type Box, type PadAction } from '../src/shared/gamepad'

function pad(buttons: number[] = [], axes: number[] = [0, 0]) {
  return { buttons: Array.from({ length: 16 }, (_, index) => ({ pressed: buttons.includes(index), touched: false, value: buttons.includes(index) ? 1 : 0 })), axes }
}
const actions = (...values: PadAction[]) => new Set(values)
const box = (x: number, y: number, width = 100, height = 100): Box => ({ left: x, top: y, right: x + width, bottom: y + height })

describe('controller input', () => {
  it('maps standard face buttons, shoulders and the d-pad', () => {
    expect(readActions(pad([0, 1, 4, 5, 12, 13, 14, 15]))).toEqual(actions('accept', 'back', 'previous', 'next', 'up', 'down', 'left', 'right'))
  })
  it('ignores stick drift and incomplete controllers', () => {
    expect(readActions(pad([], [DEAD_ZONE, -DEAD_ZONE]))).toEqual(actions())
    expect(readActions({ buttons: [], axes: [] })).toEqual(actions())
  })
  it('moves along only the dominant stick axis', () => {
    expect(readActions(pad([], [0.8, -0.9]))).toEqual(actions('up'))
    expect(readActions(pad([], [-0.9, 0.8]))).toEqual(actions('left'))
    expect(readActions(pad([], [1, 1]))).toEqual(actions('down'))
  })
  it('never repeats accept, back or section switching while held', () => {
    for (const action of ['accept', 'back', 'previous', 'next'] as const) {
      const reader = new PadRepeater()
      expect(reader.update(actions(action), 0)).toBe(action)
      expect(reader.update(actions(action), 500)).toBeUndefined()
      expect(reader.update(actions(action), 5000)).toBeUndefined()
      reader.update(actions(), 5010)
      expect(reader.update(actions(action), 5020)).toBe(action)
    }
  })
  it('delays navigation repeat, then repeats at a bounded rate', () => {
    const reader = new PadRepeater()
    expect(reader.update(actions('right'), 0)).toBe('right')
    expect(reader.update(actions('right'), 379)).toBeUndefined()
    expect(reader.update(actions('right'), 380)).toBe('right')
    expect(reader.update(actions('right'), 494)).toBeUndefined()
    expect(reader.update(actions('right'), 495)).toBe('right')
    expect(reader.update(actions('left'), 500)).toBe('left')
    expect(reader.update(actions(), 510)).toBeUndefined()
    expect(reader.update(actions('right'), 520)).toBe('right')
  })
  it('suppresses buttons and sticks held during reconnect or backgrounding until released', () => {
    const reader = new PadRepeater()
    reader.seed(actions('accept', 'right'))
    expect(reader.update(actions('accept', 'right'), 0)).toBeUndefined()
    expect(reader.update(actions('accept', 'right'), 5000)).toBeUndefined()
    reader.update(actions(), 5010)
    expect(reader.update(actions('accept'), 5020)).toBe('accept')
  })
  it('prioritizes back over simultaneous accept and direction input', () => {
    expect(new PadRepeater().update(actions('right', 'accept', 'back'), 0)).toBe('back')
  })
})

describe('spatial navigation', () => {
  it('follows each row of a cover grid', () => {
    const items = [box(120, 0), box(0, 120), box(120, 120)]
    expect(nextIndex(box(0, 0), items, 'right')).toBe(0)
    expect(nextIndex(box(0, 0), items, 'down')).toBe(1)
    expect(nextIndex(box(120, 120), [box(0, 120), box(120, 0)], 'left')).toBe(0)
    expect(nextIndex(box(120, 120), [box(0, 120), box(120, 0)], 'up')).toBe(1)
  })
  it('prefers aligned controls over a closer diagonal', () => {
    expect(nextIndex(box(0, 0), [box(120, 130), box(150, 0)], 'right')).toBe(1)
  })
  it('stays on tall library covers instead of jumping to filters just above them', () => {
    expect(nextIndex(box(35, 202, 182, 300), [box(140, 150, 90, 30), box(235, 202, 182, 300)], 'right')).toBe(1)
  })
  it('can leave a wide content card for a narrow sidebar', () => {
    expect(nextIndex(box(300, 100, 700, 200), [box(0, 130, 200, 40)], 'left')).toBe(0)
  })
  it('reaches offscreen shelf items so the caller can scroll them into view', () => {
    expect(nextIndex(box(1800, 400), [box(1920, 400), box(0, 0)], 'right')).toBe(0)
  })
  it('stays at an edge instead of wrapping to an unrelated action', () => {
    expect(nextIndex(box(0, 0), [box(120, 0), box(0, 120)], 'left')).toBe(-1)
    expect(nextIndex(box(0, 0), [], 'down')).toBe(-1)
  })
})
