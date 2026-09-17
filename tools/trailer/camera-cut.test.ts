import { expect, test } from 'bun:test'
import { cutGeometry, zoomGeometry } from './camera-cut'

test('camera direction is opposite to content movement', () => {
  expect(cutGeometry('right', 300, .24)).toEqual({ x: -300, y: 0, peakSpeed: 2500 })
  expect(cutGeometry('left', 300, .24).x).toBe(300)
  expect(cutGeometry('down', 300, .24).y).toBe(-300)
  expect(cutGeometry('up', 300, .24).y).toBe(300)
})
test('quadratic exit and longer cubic entrance meet at identical velocity', () => {
  const { x, peakSpeed } = cutGeometry('right', 300, .24)
  const exitVelocity = 2 * x / .24
  const entryVelocity = -(-x) * 3 / (.24 * 1.5)
  expect(exitVelocity).toBeCloseTo(entryVelocity)
  expect(Math.abs(entryVelocity)).toBeCloseTo(peakSpeed)
})
test('rejects invalid duration', () => expect(() => cutGeometry('right', 300, 0)).toThrow())
test('zoom in/out keep moving in the same direction across the cut', () => {
  for (const direction of ['in', 'out'] as const) {
    const { exit, enter } = zoomGeometry(direction)
    expect((exit - 1) * 2 / .24).toBeCloseTo((1 - enter) * 3 / .36)
    expect(direction === 'in' ? exit > 1 && enter < 1 : exit < 1 && enter > 1).toBe(true)
  }
  expect(() => zoomGeometry('in', 1)).toThrow()
})
