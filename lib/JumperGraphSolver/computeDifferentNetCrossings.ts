import type { JPort, JRegion } from "./jumper-types"
import { chordsCross, perimeterTForRegion } from "./perimeterChordUtils"

/**
 * Compute the number of crossings between a new port pair and existing
 * assignments in the region.
 *
 * Uses the perimeter-chord method.
 */
export function computeDifferentNetCrossings(
  region: JRegion,
  port1: JPort,
  port2: JPort,
): number {
  const newStart = port1.d
  const newEnd = port2.d
  const t1 = perimeterTForRegion(newStart, region)
  const t2 = perimeterTForRegion(newEnd, region)
  const newChord: [number, number] = [t1, t2]

  // Count crossings with existing assignments.
  let crossings = 0
  const assignments = region.assignments ?? []

  for (const assignment of assignments) {
    const existingStart = (assignment.regionPort1 as JPort).d
    const existingEnd = (assignment.regionPort2 as JPort).d
    const existingT1 = perimeterTForRegion(existingStart, region)
    const existingT2 = perimeterTForRegion(existingEnd, region)
    const existingChord: [number, number] = [existingT1, existingT2]

    if (chordsCross(newChord, existingChord)) {
      crossings++
    }
  }

  return crossings
}
