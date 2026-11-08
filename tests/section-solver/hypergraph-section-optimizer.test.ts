import { expect, test } from "bun:test"
import { generate0603JumperHyperGraph } from "@tscircuit/jumper-topology-generator"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { computeJumperGlobalCost } from "lib/HyperGraphSectionOptimizer/computeJumperGlobalCost"
import { HyperGraphSectionOptimizer } from "lib/HyperGraphSectionOptimizer/HyperGraphSectionOptimizer"
import { HyperGraphSolver } from "lib/HyperGraphSolver"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"
import { JumperSectionOptimizationPipeline } from "lib/JumperGraphSolver/JumperSectionOptimizationPipeline"
import { createProblemFromBaseGraph } from "lib/JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"
import { convertConnectionsToSerializedConnections } from "lib/convertConnectionsToSerializedConnections"
import { convertHyperGraphToSerializedHyperGraph } from "lib/convertHyperGraphToSerializedHyperGraph"
import { convertSolvedRoutesToSerializedSolvedRoutes } from "lib/convertSolvedRoutesToSerializedSolvedRoutes"
import type {
  Candidate,
  Connection,
  Region,
  RegionPort,
  SolvedRoute,
} from "lib/types"
import { createSketchedHyperGraph } from "./sketch-section-graph.fixture"

const getTotalScore = (solver: JumperGraphSolver) => {
  return computeJumperGlobalCost(solver)
}

class SectionPreferenceSolver extends HyperGraphSolver {
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

class CustomCentralRegionOptimizer extends HyperGraphSectionOptimizer {
  override getCostOfCentralRegion(region: Region): number {
    const attempts = this.regionAttemptCounts.get(region.regionId) ?? 0
    if (region.regionId === "B") return 1 + attempts * 10_000
    return 100 + attempts * 10_000
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

const createSolvedRouteForPorts = (
  ports: RegionPort[],
  connection: Connection,
  portIds: string[],
): SolvedRoute => {
  const portMap = new Map(ports.map((port) => [port.portId, port]))
  const path: Candidate[] = portIds.map((portId, index) => {
    const port = portMap.get(portId)!
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

test("score should be lower", {
  timeout: 30000,
}, () => {
  const baseGraph = generate0603JumperHyperGraph({
    rows: 5,
    cols: 5,
    orientation: "vertical",
    pattern: "grid",
    maxNeckRatio: 0.4,
    minSplitBalanceRatio: 0.2,
  })

  const graphWithConnections = createProblemFromBaseGraph({
    baseGraph: baseGraph as any,
    numCrossings: 2,
    randomSeed: 13,
  })

  const initialSolver = new JumperGraphSolver({
    inputGraph: {
      regions: graphWithConnections.regions,
      ports: graphWithConnections.ports,
    },
    inputConnections: graphWithConnections.connections,
  })
  initialSolver.solve()
  const initialScore = getTotalScore(initialSolver)

  const pipeline = new JumperSectionOptimizationPipeline({
    inputGraph: {
      regions: graphWithConnections.regions,
      ports: graphWithConnections.ports,
    },
    inputConnections: graphWithConnections.connections,
    expansionHopsFromCentralRegion: 1,
    maxAttemptsPerRegion: 1,
    sectionMaxIterations: 200_000,
    ACCEPTABLE_COST: 0,
  })

  pipeline.solve()

  expect(pipeline.solved).toBe(true)
  expect(pipeline.failed).toBe(false)

  const optimizedRoutes = pipeline.getOutput()!
  expect(optimizedRoutes).not.toBeNull()
  const optimizedSolver = new JumperGraphSolver({
    inputGraph: {
      regions: graphWithConnections.regions,
      ports: graphWithConnections.ports,
    },
    inputConnections: graphWithConnections.connections,
    inputSolvedRoutes: optimizedRoutes,
  })
  const optimizedScore = getTotalScore(optimizedSolver)
  expect(optimizedScore).toBeLessThan(initialScore)

  const mergedSvg = getSvgFromGraphicsObject(pipeline.finalVisualize()!)
  expect(mergedSvg.includes("<svg")).toBe(true)
  expect(optimizedSolver.solvedRoutes).toHaveLength(
    graphWithConnections.connections.length,
  )
})

test("HyperGraphSectionOptimizer accepts solvedHyperGraph, defaults getCostOfCentralRegion to computeIncreasedRegionCostIfPortsAreUsed + 10_000 * attempts, and replaces suboptimal section routes", () => {
  const { graph } = createSketchedHyperGraph()
  const connection: Connection = {
    connectionId: "route-main",
    mutuallyConnectedNetworkId: "route-main",
    startRegion: graph.regions.find(
      (region) => region.regionId === "boundary:left",
    )!,
    endRegion: graph.regions.find(
      (region) => region.regionId === "boundary:right",
    )!,
  }
  const initialSolvedRoute = createSolvedRouteForPorts(
    graph.ports,
    connection,
    ["p-start", "p-ab", "p-bd", "p-de", "p-ef", "p-end"],
  )

  const solvedHyperGraph = {
    ...convertHyperGraphToSerializedHyperGraph(graph),
    connections: convertConnectionsToSerializedConnections([connection]),
    solvedRoutes: convertSolvedRoutesToSerializedSolvedRoutes([
      initialSolvedRoute,
    ]),
  }

  const optimizer = new CustomCentralRegionOptimizer({
    solvedHyperGraph,
    expansionHopsFromCentralRegion: 1,
    createHyperGraphSolver: (solverInput) =>
      new SectionPreferenceSolver(solverInput),
    MAX_ATTEMPTS_PER_REGION: 1,
    MAX_ATTEMPTS_PER_SECTION: 1,
  })

  const regionB = optimizer.graph.regions.find((r) => r.regionId === "B")!
  expect(optimizer.getCostOfCentralRegion(regionB)).toBe(1)

  optimizer.step()
  expect(optimizer.activeSubSolver).not.toBeNull()
  expect(optimizer.activeSection?.centralRegionId).toBe("B")

  optimizer.solve()
  expect(optimizer.solved).toBe(true)
  expect(optimizer.failed).toBe(false)
  expect(
    optimizer.solvedRoutes[0]?.path.map((candidate) => candidate.port.portId),
  ).toEqual(["p-start", "p-ab", "p-bc", "p-ce", "p-ef", "p-end"])

  // Verify default getCostOfCentralRegion uses computeIncreasedRegionCostIfPortsAreUsed + 10_000 * attempts
  const defaultCostOptimizer = new HyperGraphSectionOptimizer({
    solvedHyperGraph,
    expansionHopsFromCentralRegion: 1,
    createHyperGraphSolver: (solverInput) =>
      new SectionPreferenceSolver(solverInput),
  })
  const defaultRegionB = defaultCostOptimizer.graph.regions.find(
    (r) => r.regionId === "B",
  )!
  const defaultRegionC = defaultCostOptimizer.graph.regions.find(
    (r) => r.regionId === "C",
  )!
  expect(defaultCostOptimizer.getCostOfCentralRegion(defaultRegionB)).toBe(5)
  expect(defaultCostOptimizer.getCostOfCentralRegion(defaultRegionC)).toBe(0)
  defaultCostOptimizer.regionAttemptCounts.set("B", 2)
  expect(defaultCostOptimizer.getCostOfCentralRegion(defaultRegionB)).toBe(
    20_005,
  )

  // Verify getConstructorParams round-trips cleanly
  const replayOptimizer = new HyperGraphSectionOptimizer({
    ...defaultCostOptimizer.getConstructorParams(),
    createHyperGraphSolver: (solverInput) =>
      new SectionPreferenceSolver(solverInput),
  })
  expect(replayOptimizer.solvedRoutes).toHaveLength(1)
})
