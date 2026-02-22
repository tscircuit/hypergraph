import type { JPort, JRegion } from "../JumperGraphSolver/jumper-types"
import {
  chordsCross,
  getPortPerimeterTInRegion,
  getRegionPerimeter,
  perimeterTPolygon,
} from "../JumperGraphSolver/perimeterChordUtils"
import type { RegionPortAssignment } from "../types"

/**
 * Maps a point to a 1D coordinate along a polygon's perimeter.
 *
 * Finds the closest edge of the polygon to the point, projects the point
 * onto that edge, then returns the cumulative distance along the polygon
 * perimeter up to that projection.
 *
 * This is the polygon-aware equivalent of `perimeterT` which only works
 * with axis-aligned bounding boxes.
 */
export function polygonPerimeterT(
  p: { x: number; y: number },
  polygon: { x: number; y: number }[],
): number {
  return perimeterTPolygon(p, polygon)
}

/**
 * Compute the number of crossings between a new port pair and existing
 * assignments in a polygon region.
 *
 * Uses polygon perimeter mapping instead of bounding-box mapping.
 */
export function computeDifferentNetCrossingsForPolygon(
  region: JRegion,
  port1: JPort,
  port2: JPort,
): number {
  const polygon = region.d.polygon
  if (!polygon || polygon.length < 3) {
    // Fallback: no polygon, use 0 crossings (shouldn't happen for via regions)
    return 0
  }

  const perimeter = getRegionPerimeter(region)
  const t1 = getPortPerimeterTInRegion(port1, region)
  const t2 = getPortPerimeterTInRegion(port2, region)
  const newChord: [number, number] = [t1, t2]

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

/**
 * Compute the assignments that would cross with a new port pair in a
 * polygon region.
 *
 * Uses polygon perimeter mapping instead of bounding-box mapping.
 */
export function computeCrossingAssignmentsForPolygon(
  region: JRegion,
  port1: JPort,
  port2: JPort,
): RegionPortAssignment[] {
  const polygon = region.d.polygon
  if (!polygon || polygon.length < 3) {
    return []
  }

  const perimeter = getRegionPerimeter(region)
  const t1 = getPortPerimeterTInRegion(port1, region)
  const t2 = getPortPerimeterTInRegion(port2, region)
  const newChord: [number, number] = [t1, t2]

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
