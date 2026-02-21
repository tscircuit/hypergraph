import type { RegionPortAssignment } from "../types"
import type { JPort, JRegion } from "./jumper-types"
import { chordsCross, perimeterTForRegion } from "./perimeterChordUtils"

/**
 * Compute the assignments that would cross with a new port pair in the region.
 *
 * Uses the perimeter-chord method.
 *
 * Returns the actual RegionPortAssignment objects that would cross with the
 * new port pair, allowing callers to determine which routes need to be ripped.
 */
export function computeCrossingAssignments(
  region: JRegion,
  port1: JPort,
  port2: JPort,
): RegionPortAssignment[] {
  const newStart = port1.d
  const newEnd = port2.d
  const t1 = perimeterTForRegion(newStart, region)
  const t2 = perimeterTForRegion(newEnd, region)
  const newChord: [number, number] = [t1, t2]

  // Find assignments that cross with the new port pair.
  const crossingAssignments: RegionPortAssignment[] = []
  const assignments = region.assignments ?? []

  for (const assignment of assignments) {
    const existingStart = (assignment.regionPort1 as JPort).d
    const existingEnd = (assignment.regionPort2 as JPort).d
    const existingT1 = perimeterTForRegion(existingStart, region)
    const existingT2 = perimeterTForRegion(existingEnd, region)
    const existingChord: [number, number] = [existingT1, existingT2]

    if (chordsCross(newChord, existingChord)) {
      crossingAssignments.push(assignment)
    }
  }

  return crossingAssignments
}
