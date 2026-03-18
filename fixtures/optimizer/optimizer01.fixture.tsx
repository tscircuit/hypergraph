import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import type { GraphicsObject } from "graphics-debug"
import {
  HyperGraphSectionOptimizer2,
  type CreateSectionSolverInput,
} from "lib/HyperGraphSectionOptimizer/HyperGraphSectionOptimizer2"
import { HyperGraphSolver } from "lib/HyperGraphSolver"
import { visualizeJumperGraphWithSolvedRoutes } from "lib/JumperGraphSolver/visualizeJumperGraphSolver"
import { convertConnectionsToSerializedConnections } from "lib/convertConnectionsToSerializedConnections"
import { convertHyperGraphToSerializedHyperGraph } from "lib/convertHyperGraphToSerializedHyperGraph"
import { convertSerializedHyperGraphToHyperGraph } from "lib/convertSerializedHyperGraphToHyperGraph"
import { convertSerializedSolvedRoutesToSolvedRoutes } from "lib/convertSerializedSolvedRoutesToSolvedRoutes"
import { convertSolvedRoutesToSerializedSolvedRoutes } from "lib/convertSolvedRoutesToSerializedSolvedRoutes"
import type {
  Candidate,
  Connection,
  HyperGraph,
  Region,
  RegionPort,
  SolvedRoute,
} from "lib/types"

class PreferenceGraphSolver extends HyperGraphSolver {
  override estimateCostToEnd(): number {
    return 0
  }

  override computeIncreasedRegionCostIfPortsAreUsed(
    region: Region,
    port1: RegionPort,
    port2: RegionPort,
  ): number {
    const transitionKey = [port1.portId, port2.portId].sort().join(":")
    if (region.regionId === "B" && transitionKey === "p-ab:p-bd") return 5
    if (region.regionId === "D" && transitionKey === "p-bd:p-de") return 5
    return 0
  }

  override visualize(): GraphicsObject {
    const graphics = visualizeJumperGraphWithSolvedRoutes({
      graph: this.graph as any,
      connections: this.connections,
      solvedRoutes: this.solvedRoutes,
      title: "Section solver",
    })
    graphics.points ??= []
    graphics.lines ??= []

    const portMap = new Map(this.graph.ports.map((port) => [port.portId, port]))
    const queuedCandidates = this.candidateQueue.peekMany(16)

    for (const [portId, g] of this.visitedPointsForCurrentConnection.entries()) {
      const port = portMap.get(portId)
      if (!port) continue
      graphics.points.push({
        x: port.d.x,
        y: port.d.y,
        color: "rgba(255, 140, 0, 0.9)",
        label: `visited\n${portId}\ng: ${g.toFixed(2)}`,
      })
    }

    for (let index = 0; index < queuedCandidates.length; index++) {
      const candidate = queuedCandidates[index]!
      graphics.points.push({
        x: candidate.port.d.x,
        y: candidate.port.d.y,
        color:
          index === 0 ? "rgba(0, 180, 0, 0.95)" : "rgba(0, 120, 255, 0.6)",
        label: [
          index === 0 ? "next" : `queue ${index + 1}`,
          candidate.port.portId,
          `g: ${candidate.g.toFixed(2)}`,
          `h: ${candidate.h.toFixed(2)}`,
          `f: ${candidate.f.toFixed(2)}`,
        ].join("\n"),
      })
    }

    if (this.lastCandidate) {
      const pathPoints: Array<{ x: number; y: number }> = []
      let cursor: Candidate | null | undefined = this.lastCandidate

      while (cursor) {
        pathPoints.unshift({ x: cursor.port.d.x, y: cursor.port.d.y })
        cursor = cursor.parent
      }

      if (pathPoints.length > 1) {
        graphics.lines.push({
          points: pathPoints,
          strokeColor: "rgba(255, 160, 0, 0.9)",
          strokeDash: "4 4",
        })
      }
    }

    return graphics
  }
}

class DebugHyperGraphSectionOptimizer2 extends HyperGraphSectionOptimizer2 {
  protected override createHyperGraphSolver(input: CreateSectionSolverInput) {
    const graph = convertSerializedHyperGraphToHyperGraph(input.inputGraph)
    return new PreferenceGraphSolver({
      inputGraph: graph,
      inputConnections: input.inputConnections,
      inputSolvedRoutes: convertSerializedSolvedRoutesToSolvedRoutes(
        input.inputSolvedRoutes,
        graph,
      ),
    })
  }

  override getCostOfCentralRegion(region: Region): number {
    if (region.regionId === "B") return 1
    return 100
  }

  override visualize(): GraphicsObject {
    if (this.activeSubSolver) {
      return this.activeSubSolver.visualize()
    }

    return visualizeJumperGraphWithSolvedRoutes({
      graph: this.graph as any,
      connections: this.connections,
      solvedRoutes: this.solvedRoutes,
      title: "Optimizer state",
    })
  }
}

const createSolver = () => {
  const { graph } = createSketchedHyperGraph()
  const connection = {
    connectionId: "route-main",
    mutuallyConnectedNetworkId: "route-main",
    startRegion: graph.regions.find(
      (region) => region.regionId === "boundary:left",
    )!,
    endRegion: graph.regions.find(
      (region) => region.regionId === "boundary:right",
    )!,
  }
  const initialSolvedRoute = createSolvedRoute(graph.ports, connection, [
    "p-start",
    "p-ab",
    "p-bd",
    "p-de",
    "p-ef",
    "p-end",
  ])

  return new DebugHyperGraphSectionOptimizer2({
    inputGraph: convertHyperGraphToSerializedHyperGraph(graph),
    inputConnections: convertConnectionsToSerializedConnections([connection]),
    inputSolvedRoutes: convertSolvedRoutesToSerializedSolvedRoutes([
      initialSolvedRoute,
    ]),
    sectionExpansionHops: 1,
    maxTargetRegionAttempts: 1,
    maxSectionAttempts: 1,
    minCentralRegionCost: 0,
  })
}

export default () => <GenericSolverDebugger createSolver={createSolver} />

const createRectRegion = (
  regionId: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Region => ({
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
): Region => ({
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
): RegionPort => {
  const port: RegionPort = {
    portId,
    region1,
    region2,
    d: { x, y },
  }
  region1.ports.push(port)
  region2.ports.push(port)
  return port
}

const createSketchedHyperGraph = (): { graph: HyperGraph } => {
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

  return { graph }
}

const createSolvedRoute = (
  ports: RegionPort[],
  connection: Connection,
  portIds: string[],
): SolvedRoute => {
  const portMap = new Map(ports.map((port) => [port.portId, port]))
  const path: Candidate[] = portIds.map((portId, index) => {
    const port = portMap.get(portId)
    if (!port) {
      throw new Error(`Missing port ${portId}`)
    }

    const previousPort = index > 0 ? portMap.get(portIds[index - 1]!) : undefined
    const nextPort =
      index < portIds.length - 1 ? portMap.get(portIds[index + 1]!) : undefined

    return {
      port,
      g: index,
      h: 0,
      f: index,
      hops: index,
      parent: undefined,
      lastPort: previousPort,
      lastRegion: previousPort
        ? getSharedRegion(previousPort, port)
        : undefined,
      nextRegion: nextPort ? getSharedRegion(port, nextPort) : undefined,
      ripRequired: false,
    }
  })

  for (let index = 1; index < path.length; index++) {
    path[index]!.parent = path[index - 1]
  }

  return {
    path,
    connection,
    requiredRip: false,
  }
}

const getSharedRegion = (
  firstPort: RegionPort,
  secondPort: RegionPort,
): Region | undefined => {
  if (
    firstPort.region1.regionId === secondPort.region1.regionId ||
    firstPort.region1.regionId === secondPort.region2.regionId
  ) {
    return firstPort.region1
  }
  if (
    firstPort.region2.regionId === secondPort.region1.regionId ||
    firstPort.region2.regionId === secondPort.region2.regionId
  ) {
    return firstPort.region2
  }
  return undefined
}
