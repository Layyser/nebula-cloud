export type ScrollBeat = { time: number; delta: number }

/** Finite, eased responses to layout changes, evaluated from film time.
 * No wall-clock scrolling: reverse seeks and exported frames match playback. */
export function scrollAt(beats: ScrollBeat[], time: number, duration = .45) {
  return Math.max(0, beats.reduce((value, beat) => {
    const p = Math.max(0, Math.min(1, (time - beat.time) / duration))
    return value + beat.delta * p * p * (3 - 2 * p)
  }, 0))
}
