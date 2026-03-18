import { expect, test } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { HyperGraphSectionOptimizer2 } from "lib/HyperGraphSectionOptimizer/HyperGraphSectionOptimizer2"
import { HyperGraphSolver } from "lib/HyperGraphSolver"
import { visualizeJumperGraphWithSolvedRoutes } from "lib/JumperGraphSolver/visualizeJumperGraphSolver"
import type {
  Candidate,
  Connection,
  Region,
  RegionPort,
  SolvedRoute,
} from "lib/types"
import { stackSvgsVertically } from "stack-svgs"
import { asJumperGraph, createSketchedHyperGraph } from "./sketch-section-graph.fixture"

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
}

class TestHyperGraphSectionOptimizer2 extends HyperGraphSectionOptimizer2 {
  override getCostOfCentralRegion(region: Region): number {
    if (region.regionId === "B") return 1
    return 100
  }
}

test("HyperGraphSectionOptimizer2 resolves a blank extracted section and reattaches it", async () => {
  const { graph } = createSketchedHyperGraph()
  const connection = {
    connectionId: "route-main",
    mutuallyConnectedNetworkId: "route-main",
    startRegion: graph.regions.find((region) => region.regionId === "boundary:left")!,
    endRegion: graph.regions.find((region) => region.regionId === "boundary:right")!,
  }
  const initialSolvedRoute = createSolvedRoute(graph.ports, connection, [
    "p-start",
    "p-ab",
    "p-bd",
    "p-de",
    "p-ef",
    "p-end",
  ])

  const sourceSolver = new PreferenceGraphSolver({
    inputGraph: graph,
    inputConnections: [connection],
    inputSolvedRoutes: [initialSolvedRoute],
  })

  const optimizer = new TestHyperGraphSectionOptimizer2({
    sourceSolver,
    currentSolvedRoutes: sourceSolver.solvedRoutes,
    sectionExpansionHops: 1,
    createSectionSolver: (input) => new PreferenceGraphSolver(input),
    maxTargetRegionAttempts: 1,
    maxSectionAttempts: 1,
    minCentralRegionCost: 0,
  })

  const beforeSvg = getSvgFromGraphicsObject(
    visualizeJumperGraphWithSolvedRoutes({
      graph: asJumperGraph(graph),
      connections: [connection],
      solvedRoutes: sourceSolver.solvedRoutes,
      title: "Before optimization",
    }),
  )

  optimizer.step()

  expect(optimizer.activeSubSolver).not.toBeNull()
  expect(optimizer.activeAttempt?.targetRegionId).toBe("B")

  optimizer.solve()

  expect(optimizer.solved).toBe(true)
  expect(optimizer.failed).toBe(false)
  expect(sourceSolver.solvedRoutes[0]?.path.map((candidate) => candidate.port.portId))
    .toEqual(["p-start", "p-ab", "p-bc", "p-ce", "p-ef", "p-end"])

  const afterSvg = getSvgFromGraphicsObject(
    visualizeJumperGraphWithSolvedRoutes({
      graph: asJumperGraph(graph),
      connections: [connection],
      solvedRoutes: sourceSolver.solvedRoutes,
      title: "After optimization",
    }),
  )

  await expect(
    stackSvgsVertically([beforeSvg, afterSvg], {
      gap: 48,
      normalizeSize: false,
    }),
  ).toMatchSvgSnapshot(import.meta.path)
})

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
