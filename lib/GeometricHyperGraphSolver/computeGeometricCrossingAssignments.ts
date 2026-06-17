import type { RegionPortAssignment } from "../types"
import {
  chordsCross,
  getPortPerimeterTInRegion,
  getRegionPerimeter,
} from "../JumperGraphSolver/perimeterChordUtils"
import type { GeometricPort, GeometricRegion } from "./geometric-types"

export const DEFAULT_SHARED_PORT_POINT_EPSILON = 1e-3

export const computeGeometricCrossingAssignments = (
  region: GeometricRegion,
  port1: GeometricPort,
  port2: GeometricPort,
): RegionPortAssignment[] => {
  const perimeter = getRegionPerimeter(region as any)
  const t1 = getPortPerimeterTInRegion(port1 as any, region as any)
  const t2 = getPortPerimeterTInRegion(port2 as any, region as any)
  const newChord: [number, number] = [t1, t2]

  const crossingAssignments: RegionPortAssignment[] = []
  for (const assignment of region.assignments ?? []) {
    const existingT1 = getPortPerimeterTInRegion(
      assignment.regionPort1 as any,
      region as any,
    )
    const existingT2 = getPortPerimeterTInRegion(
      assignment.regionPort2 as any,
      region as any,
    )
    const existingChord: [number, number] = [existingT1, existingT2]

    if (
      chordsCross(newChord, existingChord, perimeter) ||
      assignmentsSharePortPoint(
        port1,
        port2,
        assignment.regionPort1 as GeometricPort,
        assignment.regionPort2 as GeometricPort,
      )
    ) {
      crossingAssignments.push(assignment)
    }
  }

  return crossingAssignments
}

export const computeDifferentNetGeometricCrossings = (
  region: GeometricRegion,
  port1: GeometricPort,
  port2: GeometricPort,
  currentNetworkId: string,
): number =>
  computeGeometricCrossingAssignments(region, port1, port2).filter(
    (assignment) =>
      assignment.connection.mutuallyConnectedNetworkId !== currentNetworkId,
  ).length

export const assignmentsSharePortPoint = (
  port1: GeometricPort,
  port2: GeometricPort,
  otherPort1: GeometricPort,
  otherPort2: GeometricPort,
  epsilon = DEFAULT_SHARED_PORT_POINT_EPSILON,
): boolean => {
  return (
    pointsAreNear(port1, otherPort1, epsilon) ||
    pointsAreNear(port1, otherPort2, epsilon) ||
    pointsAreNear(port2, otherPort1, epsilon) ||
    pointsAreNear(port2, otherPort2, epsilon)
  )
}

export const pointsAreNear = (
  portA: GeometricPort,
  portB: GeometricPort,
  epsilon: number,
): boolean => {
  const dx = portA.d.x - portB.d.x
  const dy = portA.d.y - portB.d.y
  return dx * dx + dy * dy <= epsilon * epsilon
}
