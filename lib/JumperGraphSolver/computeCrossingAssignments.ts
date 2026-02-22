import type { RegionPortAssignment } from "../types"
import type { JPort, JRegion } from "./jumper-types"
import {
  chordsCross,
  getPortPerimeterTInRegion,
  getRegionPerimeter,
} from "./perimeterChordUtils"

/**
 * Compute the assignments that would cross with a new port pair in the region.
 *
 * Uses the circle/perimeter mapping approach: two connections MUST cross
 * if their boundary points interleave around the perimeter.
 *
 * Returns the actual RegionPortAssignment objects that would cross with the
 * new port pair, allowing callers to determine which routes need to be ripped.
 */
export function computeCrossingAssignments(
  region: JRegion,
  port1: JPort,
  port2: JPort,
): RegionPortAssignment[] {
  const perimeter = getRegionPerimeter(region)

  // Map the new port pair to perimeter coordinates
  const t1 = getPortPerimeterTInRegion(port1, region)
  const t2 = getPortPerimeterTInRegion(port2, region)
  const newChord: [number, number] = [t1, t2]

  // Find assignments that cross with the new chord
  const crossingAssignments: RegionPortAssignment[] = []
  const assignments = region.assignments ?? []

  for (const assignment of assignments) {
    const existingT1 = getPortPerimeterTInRegion(
      assignment.regionPort1 as JPort,
      region,
    )
    const existingT2 = getPortPerimeterTInRegion(
      assignment.regionPort2 as JPort,
      region,
    )
    const existingChord: [number, number] = [existingT1, existingT2]

    if (chordsCross(newChord, existingChord, perimeter)) {
      crossingAssignments.push(assignment)
    }
  }

  return crossingAssignments
}
