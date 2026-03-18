import { expect, test } from "bun:test"
import type { GraphicsObject } from "graphics-debug"
import { getSvgFromGraphicsObject } from "graphics-debug"
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
  Region,
  RegionPort,
  SolvedRoute,
} from "lib/types"
import { stackSvgsVertically } from "stack-svgs"
import {
  asJumperGraph,
  createSketchedHyperGraph,
} from "./sketch-section-graph.fixture"

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

    for (const [
      portId,
      g,
    ] of this.visitedPointsForCurrentConnection.entries()) {
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
        color: index === 0 ? "rgba(0, 180, 0, 0.95)" : "rgba(0, 120, 255, 0.6)",
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

class TestHyperGraphSectionOptimizer2 extends HyperGraphSectionOptimizer2 {
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

test("HyperGraphSectionOptimizer2 resolves a blank extracted section and reattaches it", async () => {
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

  const optimizer = new TestHyperGraphSectionOptimizer2({
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

  const stepSvgs = [
    getSvgFromGraphicsObject(
      withTitle(
        visualizeJumperGraphWithSolvedRoutes({
          graph: asJumperGraph(graph),
          connections: [connection],
          solvedRoutes: optimizer.solvedRoutes,
          title: "Before optimization",
        }),
        "Step 0",
      ),
    ),
  ]

  for (let stepIndex = 1; stepIndex <= 6; stepIndex++) {
    optimizer.step()
    if (stepIndex === 1) {
      expect(optimizer.activeSubSolver).not.toBeNull()
      expect(optimizer.activeAttempt?.targetRegionId).toBe("B")
    }
    stepSvgs.push(
      getSvgFromGraphicsObject(
        withTitle(optimizer.visualize(), `Step ${stepIndex}`),
      ),
    )
  }

  optimizer.solve()

  expect(optimizer.solved).toBe(true)
  expect(optimizer.failed).toBe(false)
  expect(
    optimizer.solvedRoutes[0]?.path.map((candidate) => candidate.port.portId),
  ).toEqual(["p-start", "p-ab", "p-bc", "p-ce", "p-ef", "p-end"])

  await expect(
    stackSvgsVertically(stepSvgs, {
      gap: 48,
      normalizeSize: false,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})

const withTitle = (graphics: GraphicsObject, title: string): GraphicsObject => {
  return {
    ...graphics,
    title,
  }
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

    const previousPort =
      index > 0 ? portMap.get(portIds[index - 1]!) : undefined
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
