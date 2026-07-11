import type { Pin } from './types'

/** True for the single-flat-path shape the admin's draw/reshape UI produces. */
export function isSingleSegmentLine(line: Pin['line']): line is [number, number][] {
  if (!line || line.length === 0) return false
  return typeof line[0][0] === 'number'
}

/** Normalizes a pin's `line` (one path, or several disjoint segments) to the multi-segment form. */
export function lineSegments(line: Pin['line']): [number, number][][] {
  if (!line?.length) return []
  return isSingleSegmentLine(line) ? [line] : (line as [number, number][][])
}
