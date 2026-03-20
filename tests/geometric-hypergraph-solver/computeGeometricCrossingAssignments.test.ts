import { expect, test } from "bun:test"
import { computeGeometricCrossingAssignments } from "lib/GeometricHyperGraphSolver/computeGeometricCrossingAssignments"
import {
  countCommittedGeometricRouteIntersections,
  getCommittedGeometricIntersectionMarkers,
} from "lib/GeometricHyperGraphSolver/computeGeometricIntersectionPenaltyCost"
import type {
  GeometricPort,
  GeometricRegion,
} from "lib/GeometricHyperGraphSolver/geometric-types"
import type { Connection, RegionPortAssignment } from "lib/types"

const createRegion = (regionId: string): GeometricRegion =>
  ({
    regionId,
    ports: [],
    assignments: [],
    d: {
      center: { x: 1, y: 1 },
      bounds: { minX: 0, maxX: 2, minY: 0, maxY: 2 },
    },
  }) as GeometricRegion

const createPort = (
  portId: string,
  x: number,
  y: number,
  region: GeometricRegion,
): GeometricPort => {
  const outsideRegion = {
    regionId: `${portId}:outside`,
    ports: [],
    assignments: [],
    d: {
      center: { x, y },
      bounds: { minX: x, maxX: x, minY: y, maxY: y },
    },
  } as GeometricRegion

  const port = {
    portId,
    region1: region,
    region2: outsideRegion,
    d: { x, y },
  } as GeometricPort
  region.ports.push(port)
  return port
}

const createAssignment = (
  region: GeometricRegion,
  regionPort1: GeometricPort,
  regionPort2: GeometricPort,
  connectionId: string,
): RegionPortAssignment => {
  const connection: Connection = {
    connectionId,
    mutuallyConnectedNetworkId: connectionId,
    startRegion: region,
    endRegion: region,
  }
  return {
    region,
    regionPort1,
    regionPort2,
    connection,
    solvedRoute: {
      connection,
      requiredRip: false,
      path: [],
    },
  }
}

test("computeGeometricCrossingAssignments counts near-coincident port points as intersections", () => {
  const region = createRegion("r1")
  const left = createPort("left", 0, 1, region)
  const top = createPort("top", 1, 2, region)
  const almostTop = createPort("almost-top", 1, 2 + 1e-4, region)
  const right = createPort("right", 2, 1, region)

  const assignment = createAssignment(region, left, top, "existing")
  region.assignments = [assignment]

  const crossings = computeGeometricCrossingAssignments(
    region,
    almostTop,
    right,
  )

  expect(crossings).toHaveLength(1)
  expect(crossings[0]).toBe(assignment)
})

test("getCommittedGeometricIntersectionMarkers returns drawable points for crossings and shared port points", () => {
  const crossingRegion = createRegion("crossing")
  const left = createPort("left", 0, 1, crossingRegion)
  const right = createPort("right", 2, 1, crossingRegion)
  const top = createPort("top", 1, 2, crossingRegion)
  const bottom = createPort("bottom", 1, 0, crossingRegion)

  crossingRegion.assignments = [
    createAssignment(crossingRegion, left, right, "horizontal"),
    createAssignment(crossingRegion, top, bottom, "vertical"),
  ]

  const sharedRegion = createRegion("shared")
  const shared = createPort("shared", 1, 2, sharedRegion)
  const almostShared = createPort("almost-shared", 1, 2 + 1e-4, sharedRegion)
  const leftShared = createPort("left-shared", 0, 1, sharedRegion)
  const rightShared = createPort("right-shared", 2, 1, sharedRegion)

  sharedRegion.assignments = [
    createAssignment(sharedRegion, leftShared, shared, "shared-a"),
    createAssignment(sharedRegion, almostShared, rightShared, "shared-b"),
  ]

  const graph = {
    ports: [
      left,
      right,
      top,
      bottom,
      shared,
      almostShared,
      leftShared,
      rightShared,
    ],
    regions: [crossingRegion, sharedRegion],
  }

  const markers = getCommittedGeometricIntersectionMarkers(graph as any)

  expect(countCommittedGeometricRouteIntersections(graph as any)).toBe(2)
  expect(markers).toHaveLength(2)
  expect(markers[0]).toEqual({ x: 1, y: 1 })
  expect(markers[1]!.x).toBeCloseTo(1, 6)
  expect(markers[1]!.y).toBeCloseTo(2 + 5e-5, 6)
})
