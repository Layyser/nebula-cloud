import { expect, test } from 'bun:test'
import { scrollAt } from './scroll-track'

test('layout changes ease in and settle exactly', () => {
  const beats = [{ time: 1, delta: 100 }]
  expect(scrollAt(beats, 1)).toBe(0)
  expect(scrollAt(beats, 1.225)).toBeCloseTo(50)
  expect(scrollAt(beats, 1.5)).toBe(100)
})
test('reverse seeking is independent of playback history', () => {
  const beats = [{ time: 1, delta: 100 }, { time: 2, delta: 40 }]
  expect(scrollAt(beats, 3)).toBe(140)
  expect(scrollAt(beats, 0)).toBe(0)
  expect(scrollAt(beats, 1.5)).toBe(100)
})
