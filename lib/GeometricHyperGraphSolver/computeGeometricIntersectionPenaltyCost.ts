import { commitSolvedRoutes } from "../solvedRoutes"
import type { Connection, SolvedRoute } from "../types"
import {
  DEFAULT_SHARED_PORT_POINT_EPSILON,
  assignmentsSharePortPoint,
  pointsAreNear,
} from "./computeGeometricCrossingAssignments"
import type {
  GeometricHyperGraph,
  GeometricPoint,
  GeometricPort,
  GeometricRegion,
} from "./geometric-types"
import {
  chordsCross,
  getPortPerimeterTInRegion,
  getRegionPerimeter,
} from "../JumperGraphSolver/perimeterChordUtils"

type IntersectionMarker = GeometricPoint

export const countCommittedGeometricRouteIntersections = (
  graph: GeometricHyperGraph,
): number => collectCommittedGeometricIntersectionMarkers(graph).length

export const getCommittedGeometricIntersectionMarkers = (
  graph: GeometricHyperGraph,
): IntersectionMarker[] => collectCommittedGeometricIntersectionMarkers(graph)

export const computeCommittedGeometricIntersectionPenaltyCost = (
  graph: GeometricHyperGraph,
  intersectionPenalty: number,
): number =>
  countCommittedGeometricRouteIntersections(graph) * intersectionPenalty

export const computeGeometricIntersectionPenaltyCostForSolvedRoutes = (input: {
  graph: GeometricHyperGraph
  connections: Connection[]
  solvedRoutes: SolvedRoute[]
  intersectionPenalty: number
}): number => {
  commitSolvedRoutes(input)
  return computeCommittedGeometricIntersectionPenaltyCost(
    input.graph,
    input.intersectionPenalty,
  )
}

const collectCommittedGeometricIntersectionMarkers = (
  graph: GeometricHyperGraph,
): IntersectionMarker[] => {
  const markers: IntersectionMarker[] = []

  for (const region of graph.regions) {
    const assignments = region.assignments ?? []
    for (let i = 0; i < assignments.length; i++) {
      const assignment = assignments[i]!
      for (let j = i + 1; j < assignments.length; j++) {
        const otherAssignment = assignments[j]!
        if (
          assignment.connection.mutuallyConnectedNetworkId ===
          otherAssignment.connection.mutuallyConnectedNetworkId
        ) {
          continue
        }

        const marker = getAssignmentIntersectionMarker(
          region,
          assignment.regionPort1 as GeometricPort,
          assignment.regionPort2 as GeometricPort,
          otherAssignment.regionPort1 as GeometricPort,
          otherAssignment.regionPort2 as GeometricPort,
        )
        if (marker) {
          markers.push(marker)
        }
      }
    }
  }

  return markers
}

const getAssignmentIntersectionMarker = (
  region: GeometricRegion,
  port1: GeometricPort,
  port2: GeometricPort,
  otherPort1: GeometricPort,
  otherPort2: GeometricPort,
): IntersectionMarker | null => {
  const perimeter = getRegionPerimeter(region as any)
  const t1 = getPortPerimeterTInRegion(port1 as any, region as any)
  const t2 = getPortPerimeterTInRegion(port2 as any, region as any)
  const otherT1 = getPortPerimeterTInRegion(otherPort1 as any, region as any)
  const otherT2 = getPortPerimeterTInRegion(otherPort2 as any, region as any)

  if (chordsCross([t1, t2], [otherT1, otherT2], perimeter)) {
    return (
      getLineSegmentIntersectionPoint(
        port1.d,
        port2.d,
        otherPort1.d,
        otherPort2.d,
      ) ?? {
        x: (port1.d.x + port2.d.x + otherPort1.d.x + otherPort2.d.x) / 4,
        y: (port1.d.y + port2.d.y + otherPort1.d.y + otherPort2.d.y) / 4,
      }
    )
  }

  if (
    assignmentsSharePortPoint(
      port1,
      port2,
      otherPort1,
      otherPort2,
      DEFAULT_SHARED_PORT_POINT_EPSILON,
    )
  ) {
    return getSharedPortPoint(port1, port2, otherPort1, otherPort2)
  }

  return null
}

const getSharedPortPoint = (
  port1: GeometricPort,
  port2: GeometricPort,
  otherPort1: GeometricPort,
  otherPort2: GeometricPort,
): IntersectionMarker | null => {
  const sharedPairs: Array<[GeometricPort, GeometricPort]> = [
    [port1, otherPort1],
    [port1, otherPort2],
    [port2, otherPort1],
    [port2, otherPort2],
  ]

  for (const [a, b] of sharedPairs) {
    if (pointsAreNear(a, b, DEFAULT_SHARED_PORT_POINT_EPSILON)) {
      return {
        x: (a.d.x + b.d.x) / 2,
        y: (a.d.y + b.d.y) / 2,
      }
    }
  }

  return null
}

const getLineSegmentIntersectionPoint = (
  a1: GeometricPoint,
  a2: GeometricPoint,
  b1: GeometricPoint,
  b2: GeometricPoint,
): IntersectionMarker | null => {
  const denominator =
    (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x)

  if (Math.abs(denominator) < 1e-9) {
    return null
  }

  const determinantA = a1.x * a2.y - a1.y * a2.x
  const determinantB = b1.x * b2.y - b1.y * b2.x

  return {
    x:
      (determinantA * (b1.x - b2.x) - (a1.x - a2.x) * determinantB) /
      denominator,
    y:
      (determinantA * (b1.y - b2.y) - (a1.y - a2.y) * determinantB) /
      denominator,
  }
}
