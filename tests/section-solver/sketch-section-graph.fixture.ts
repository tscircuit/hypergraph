import type {
  JumperGraph,
  JPort,
  JRegion,
} from "lib/JumperGraphSolver/jumper-types"
import type {
  Candidate,
  Connection,
  HyperGraph,
  Region,
  RegionPort,
  SolvedRoute,
} from "lib/types"

const createRectRegion = (
  regionId: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): JRegion => ({
  regionId,
  ports: [],
  d: {
    bounds: { minX, minY, maxX, maxY },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    isPad: false,
  },
  assignments: [],
})

const createBoundaryRegion = (
  regionId: string,
  x: number,
  y: number,
): JRegion => ({
  regionId,
  ports: [],
  d: {
    bounds: {
      minX: x - 0.05,
      maxX: x + 0.05,
      minY: y - 0.05,
      maxY: y + 0.05,
    },
    center: { x, y },
    isPad: false,
  },
  assignments: [],
})

const connect = (
  portId: string,
  region1: Region,
  region2: Region,
  x: number,
  y: number,
): JPort => {
  const port: JPort = {
    portId,
    region1,
    region2,
    d: { x, y },
  }
  region1.ports.push(port)
  region2.ports.push(port)
  return port
}

const createCandidate = (
  port: RegionPort,
  previous: Candidate | undefined,
  lastRegion: Region | undefined,
  nextRegion: Region | undefined,
): Candidate => ({
  port,
  g: previous ? previous.g + 1 : 0,
  h: 0,
  f: previous ? previous.g + 1 : 0,
  hops: previous ? previous.hops + 1 : 0,
  ripRequired: false,
  parent: previous,
  lastPort: previous?.port,
  lastRegion,
  nextRegion,
})

export const createSketchedHyperGraph = (): {
  graph: HyperGraph
  solvedRoutes: SolvedRoute[]
  connection: Connection
} => {
  const regionA = createRectRegion("A", 0, 4, 4, 8)
  const regionB = createRectRegion("B", 4, 4, 8, 8)
  const regionC = createRectRegion("C", 8, 4, 12, 8)
  const regionD = createRectRegion("D", 4, 0, 8, 4)
  const regionE = createRectRegion("E", 8, 0, 12, 4)
  const regionF = createRectRegion("F", 12, 0, 16, 4)

  const boundaryLeft = createBoundaryRegion("boundary:left", 0, 5.6)
  const boundaryRight = createBoundaryRegion("boundary:right", 16, 1.7)
  const boundaryCRightUpper = createBoundaryRegion(
    "boundary:c-right-upper",
    12,
    6.4,
  )
  const boundaryCRightLower = createBoundaryRegion(
    "boundary:c-right-lower",
    12,
    4.9,
  )
  const boundaryDBottomLeft = createBoundaryRegion(
    "boundary:d-bottom-left",
    5.1,
    0,
  )
  const boundaryDBottomRight = createBoundaryRegion(
    "boundary:d-bottom-right",
    6.7,
    0,
  )
  const boundaryEBottomLeft = createBoundaryRegion(
    "boundary:e-bottom-left",
    9.2,
    0,
  )
  const boundaryEBottomRight = createBoundaryRegion(
    "boundary:e-bottom-right",
    11.1,
    0,
  )

  const graph: HyperGraph = {
    regions: [
      regionA,
      regionB,
      regionC,
      regionD,
      regionE,
      regionF,
      boundaryLeft,
      boundaryRight,
      boundaryCRightUpper,
      boundaryCRightLower,
      boundaryDBottomLeft,
      boundaryDBottomRight,
      boundaryEBottomLeft,
      boundaryEBottomRight,
    ],
    ports: [],
  }

  graph.ports.push(
    connect("p-start", boundaryLeft, regionA, 0, 5.6),
    connect("p-ab", regionA, regionB, 4, 5.5),
    connect("p-bc", regionB, regionC, 8, 5.3),
    connect("p-bd", regionB, regionD, 6, 4),
    connect("p-ce", regionC, regionE, 10, 4),
    connect("p-de", regionD, regionE, 8, 2),
    connect("p-ef-upper", regionE, regionF, 12, 2.8),
    connect("p-ef", regionE, regionF, 12, 1.2),
    connect("p-end", regionF, boundaryRight, 16, 1.7),
    connect("p-c-right-upper", regionC, boundaryCRightUpper, 12, 6.4),
    connect("p-c-right-lower", regionC, boundaryCRightLower, 12, 4.9),
    connect("p-d-bottom-left", regionD, boundaryDBottomLeft, 5.1, 0),
    connect("p-d-bottom-right", regionD, boundaryDBottomRight, 6.7, 0),
    connect("p-e-bottom-left", regionE, boundaryEBottomLeft, 9.2, 0),
    connect("p-e-bottom-right", regionE, boundaryEBottomRight, 11.1, 0),
  )

  const connection: Connection = {
    connectionId: "route-main",
    mutuallyConnectedNetworkId: "route-main",
    startRegion: regionA,
    endRegion: regionF,
  }

  const routePath = [
    createCandidate(
      graph.ports.find((port) => port.portId === "p-start")!,
      undefined,
      undefined,
      regionA,
    ),
    createCandidate(
      graph.ports.find((port) => port.portId === "p-ab")!,
      undefined,
      regionA,
      regionB,
    ),
    createCandidate(
      graph.ports.find((port) => port.portId === "p-bd")!,
      undefined,
      regionB,
      regionD,
    ),
    createCandidate(
      graph.ports.find((port) => port.portId === "p-de")!,
      undefined,
      regionD,
      regionE,
    ),
    createCandidate(
      graph.ports.find((port) => port.portId === "p-ef")!,
      undefined,
      regionE,
      regionF,
    ),
    createCandidate(
      graph.ports.find((port) => port.portId === "p-end")!,
      undefined,
      regionF,
      undefined,
    ),
  ]

  for (let i = 1; i < routePath.length; i++) {
    routePath[i]!.parent = routePath[i - 1]
    routePath[i]!.lastPort = routePath[i - 1]!.port
    routePath[i]!.g = routePath[i - 1]!.g + 1
    routePath[i]!.f = routePath[i]!.g
    routePath[i]!.hops = i
  }

  const solvedRoutes: SolvedRoute[] = [
    {
      path: routePath,
      connection,
      requiredRip: false,
    },
  ]

  return { graph, solvedRoutes, connection }
}

export const asJumperGraph = (graph: HyperGraph): JumperGraph =>
  graph as JumperGraph
