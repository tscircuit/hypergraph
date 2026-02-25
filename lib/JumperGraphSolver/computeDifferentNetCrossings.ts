import type { JPort, JRegion } from "./jumper-types"
import {
  chordsCross,
  getPortPerimeterTInRegion,
  getRegionPerimeter,
} from "./perimeterChordUtils"

/**
 * Compute the number of crossings between a new port pair and existing
 * assignments in the region.
 *
 * Uses the circle/perimeter mapping approach: two connections MUST cross
 * if their boundary points interleave around the perimeter.
 */
export function computeDifferentNetCrossings(
  region: JRegion,
  port1: JPort,
  port2: JPort,
): number {
  const perimeter = getRegionPerimeter(region)

  // Map the new port pair to perimeter coordinates
  const t1 = getPortPerimeterTInRegion(port1, region)
  const t2 = getPortPerimeterTInRegion(port2, region)
  const newChord: [number, number] = [t1, t2]

  // Count crossings with existing assignments
  let crossings = 0
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
      crossings++
    }
  }

  return crossings
}
