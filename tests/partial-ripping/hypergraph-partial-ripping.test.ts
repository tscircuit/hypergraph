import { describe, expect, test } from "bun:test"
import { HyperGraphPartialRipping } from "lib/HyperGraphPartialRipping"
import type {
  Connection,
  HyperGraph,
  Region,
  RegionPort,
  RegionPortAssignment,
  SolvedRoute,
} from "lib/types"

type TestRegionData = {
  crossingCost?: number
  entryCost?: number
}

function createRegion(regionId: string, d: TestRegionData = {}): Region {
  return {
    regionId,
    ports: [],
    d,
    assignments: [],
  }
}

function connectRegions(
  portId: string,
  region1: Region,
  region2: Region,
): RegionPort {
  const port: RegionPort = {
    portId,
    region1,
    region2,
    d: {},
  }
  region1.ports.push(port)
  region2.ports.push(port)
  return port
}

/**
 * Minimal deterministic subclass of HyperGraphPartialRipping for testing:
 * - Any two different-net routes passing through the same region are treated as
 *   crossing each other.
 * - The increased region cost is read from `region.d.crossingCost ?? 0` when a
 *   different-net assignment already exists in that region (plus optional
 *   `region.d.entryCost ?? 0` to steer detour paths deterministically).
 */
class TestPartialRippingSolver extends HyperGraphPartialRipping {
  rippedConnectionIds: string[] = []

  override computeIncreasedRegionCostIfPortsAreUsed(
    region: Region,
    _port1: RegionPort,
    _port2: RegionPort,
  ): number {
    const data = (region.d ?? {}) as TestRegionData
    const baseCost = data.entryCost ?? 0
    const hasDifferentNetAssignment = (region.assignments ?? []).some(
      (a) =>
        a.connection.mutuallyConnectedNetworkId !==
        this.currentConnection!.mutuallyConnectedNetworkId,
    )
    if (!hasDifferentNetAssignment) return baseCost
    return baseCost + (data.crossingCost ?? 0)
  }

  override getRipsRequiredForPortUsage(
    region: Region,
    _port1: RegionPort,
    _port2: RegionPort,
  ): RegionPortAssignment[] {
    return (region.assignments ?? []).filter(
      (a) =>
        a.connection.mutuallyConnectedNetworkId !==
        this.currentConnection!.mutuallyConnectedNetworkId,
    )
  }

  override ripSolvedRoute(solvedRoute: SolvedRoute): void {
    this.rippedConnectionIds.push(solvedRoute.connection.connectionId)
    super.ripSolvedRoute(solvedRoute)
  }
}

/**
 * Builds a single-shared-region graph:
 * - connA: startA -> shared -> endA (with optional detour startA -> detourA -> endA)
 * - connB: startB -> shared -> endB
 * connA uses distinct ports from connB in `shared` so they cross without port overlap.
 */
function createSingleCrossingGraph(crossingCost: number): {
  graph: HyperGraph
  connections: Connection[]
} {
  const startA = createRegion("startA")
  const endA = createRegion("endA")
  const detourA = createRegion("detourA", { entryCost: 50 })
  const startB = createRegion("startB")
  const endB = createRegion("endB")
  const shared = createRegion("shared", { crossingCost })

  const ports = [
    connectRegions("p_startA_shared", startA, shared),
    connectRegions("p_shared_endA", shared, endA),
    connectRegions("p_startA_detourA", startA, detourA),
    connectRegions("p_detourA_endA", detourA, endA),
    connectRegions("p_startB_shared", startB, shared),
    connectRegions("p_shared_endB", shared, endB),
  ]

  const regions = [startA, endA, detourA, startB, endB, shared]

  const connections: Connection[] = [
    {
      connectionId: "connA",
      mutuallyConnectedNetworkId: "netA",
      startRegion: startA,
      endRegion: endA,
    },
    {
      connectionId: "connB",
      mutuallyConnectedNetworkId: "netB",
      startRegion: startB,
      endRegion: endB,
    },
  ]

  return { graph: { regions, ports }, connections }
}

/**
 * Builds a two-region graph where connC passes through both `lowCostRegion`
 * (occupied by connA) and `highCostRegion` (occupied by connB).
 * connB has a higher-entryCost detour so it can re-route cleanly after being ripped.
 */
function createSelectiveRippingGraph(): {
  graph: HyperGraph
  connections: Connection[]
} {
  const startA = createRegion("startA")
  const endA = createRegion("endA")
  const detourA = createRegion("detourA", { entryCost: 50 })

  const startB = createRegion("startB")
  const endB = createRegion("endB")
  const detourB = createRegion("detourB", { entryCost: 50 })

  const startC = createRegion("startC")
  const endC = createRegion("endC")

  const lowCostRegion = createRegion("lowCostRegion", { crossingCost: 2 })
  const highCostRegion = createRegion("highCostRegion", { crossingCost: 10 })

  const ports = [
    // connA paths
    connectRegions("p_startA_low", startA, lowCostRegion),
    connectRegions("p_low_endA", lowCostRegion, endA),
    connectRegions("p_startA_detourA", startA, detourA),
    connectRegions("p_detourA_endA", detourA, endA),
    // connB paths
    connectRegions("p_startB_high", startB, highCostRegion),
    connectRegions("p_high_endB", highCostRegion, endB),
    connectRegions("p_startB_detourB", startB, detourB),
    connectRegions("p_detourB_endB", detourB, endB),
    // connC path through both regions
    connectRegions("p_startC_low", startC, lowCostRegion),
    connectRegions("p_low_high", lowCostRegion, highCostRegion),
    connectRegions("p_high_endC", highCostRegion, endC),
  ]

  const regions = [
    startA,
    endA,
    detourA,
    startB,
    endB,
    detourB,
    startC,
    endC,
    lowCostRegion,
    highCostRegion,
  ]

  const connections: Connection[] = [
    {
      connectionId: "connA",
      mutuallyConnectedNetworkId: "netA",
      startRegion: startA,
      endRegion: endA,
    },
    {
      connectionId: "connB",
      mutuallyConnectedNetworkId: "netB",
      startRegion: startB,
      endRegion: endB,
    },
    {
      connectionId: "connC",
      mutuallyConnectedNetworkId: "netC",
      startRegion: startC,
      endRegion: endC,
    },
  ]

  return { graph: { regions, ports }, connections }
}

describe("HyperGraphPartialRipping", () => {
  test("preserves crossing route when cost is below ripCostThreshold", () => {
    const { graph, connections } = createSingleCrossingGraph(3)
    const solver = new TestPartialRippingSolver({
      inputGraph: graph,
      inputConnections: connections,
      ripCostThreshold: 5,
    })

    solver.solve()

    expect(solver.solved).toBe(true)
    expect(solver.rippedConnectionIds).toEqual([])
    expect(solver.solvedRoutes).toHaveLength(2)

    const routeA = solver.solvedRoutes.find(
      (r) => r.connection.connectionId === "connA",
    )!
    expect(routeA.path.map((c) => c.port.portId)).toEqual([
      "p_startA_shared",
      "p_shared_endA",
    ])
  })

  test("preserves crossing route when cost equals ripCostThreshold", () => {
    const { graph, connections } = createSingleCrossingGraph(5)
    const solver = new TestPartialRippingSolver({
      inputGraph: graph,
      inputConnections: connections,
      ripCostThreshold: 5,
    })

    solver.solve()

    expect(solver.solved).toBe(true)
    expect(solver.rippedConnectionIds).toEqual([])
    expect(solver.solvedRoutes).toHaveLength(2)
  })

  test("rips and re-routes crossing route when cost exceeds ripCostThreshold", () => {
    const { graph, connections } = createSingleCrossingGraph(8)
    // Penalize ripped ports so connA detours instead of re-crossing forever.
    const solver = new (class extends TestPartialRippingSolver {
      override getPortUsagePenalty(port: RegionPort): number {
        return (port.ripCount ?? 0) * 100
      }
    })({
      inputGraph: graph,
      inputConnections: connections,
      ripCostThreshold: 5,
    })

    solver.solve()
    expect(solver.solved).toBe(true)
    expect(solver.rippedConnectionIds).toEqual(["connA"])

    const routeA = solver.solvedRoutes.find(
      (r) => r.connection.connectionId === "connA",
    )!
    expect(routeA.path.map((c) => c.port.portId)).toEqual([
      "p_startA_detourA",
      "p_detourA_endA",
    ])
  })

  test("selectively rips high-cost route while preserving low-cost route on the same path", () => {
    const { graph, connections } = createSelectiveRippingGraph()
    const solver = new (class extends TestPartialRippingSolver {
      override getPortUsagePenalty(port: RegionPort): number {
        return (port.ripCount ?? 0) * 100
      }
    })({
      inputGraph: graph,
      inputConnections: connections,
      ripCostThreshold: 5,
    })

    solver.solve()

    expect(solver.solved).toBe(true)
    expect(solver.solvedRoutes).toHaveLength(3)

    // Only connB (cost 10 > 5) should be ripped; connA (cost 2 <= 5) is preserved
    expect(solver.rippedConnectionIds).toEqual(["connB"])

    const routeA = solver.solvedRoutes.find(
      (r) => r.connection.connectionId === "connA",
    )!
    expect(routeA.path.map((c) => c.port.portId)).toEqual([
      "p_startA_low",
      "p_low_endA",
    ])

    const routeB = solver.solvedRoutes.find(
      (r) => r.connection.connectionId === "connB",
    )!
    expect(routeB.path.map((c) => c.port.portId)).toEqual([
      "p_startB_detourB",
      "p_detourB_endB",
    ])

    const routeC = solver.solvedRoutes.find(
      (r) => r.connection.connectionId === "connC",
    )!
    expect(routeC.path.map((c) => c.port.portId)).toEqual([
      "p_startC_low",
      "p_low_high",
      "p_high_endC",
    ])
  })

  test("always rips port-overlap routes from different networks even with Infinity threshold", () => {
    const startA = createRegion("startA")
    const endA = createRegion("endA")
    const detourA = createRegion("detourA", { entryCost: 50 })
    const startB = createRegion("startB")
    const endB = createRegion("endB")
    const bridge1 = createRegion("bridge1")
    const bridge2 = createRegion("bridge2")

    // Both connA and connB must traverse the single shared port `p_shared_bridge`
    const ports = [
      connectRegions("p_startA_b1", startA, bridge1),
      connectRegions("p_startB_b1", startB, bridge1),
      connectRegions("p_shared_bridge", bridge1, bridge2),
      connectRegions("p_b2_endA", bridge2, endA),
      connectRegions("p_b2_endB", bridge2, endB),
      connectRegions("p_startA_detourA", startA, detourA),
      connectRegions("p_detourA_endA", detourA, endA),
    ]

    const regions = [startA, endA, detourA, startB, endB, bridge1, bridge2]
    const connections: Connection[] = [
      {
        connectionId: "connA",
        mutuallyConnectedNetworkId: "netA",
        startRegion: startA,
        endRegion: endA,
      },
      {
        connectionId: "connB",
        mutuallyConnectedNetworkId: "netB",
        startRegion: startB,
        endRegion: endB,
      },
    ]

    const solver = new (class extends TestPartialRippingSolver {
      override getPortUsagePenalty(port: RegionPort): number {
        return (port.ripCount ?? 0) * 100
      }
    })({
      inputGraph: { regions, ports },
      inputConnections: connections,
      ripCostThreshold: Number.POSITIVE_INFINITY,
    })

    solver.solve()

    expect(solver.solved).toBe(true)
    expect(solver.rippedConnectionIds).toEqual(["connA"])

    const sharedPort = solver.graph.ports.find(
      (p) => p.portId === "p_shared_bridge",
    )!
    expect(sharedPort.assignment?.connection.connectionId).toBe("connB")

    const routeA = solver.solvedRoutes.find(
      (r) => r.connection.connectionId === "connA",
    )!
    expect(routeA.path.map((c) => c.port.portId)).toEqual([
      "p_startA_detourA",
      "p_detourA_endA",
    ])
  })

  test("supports custom shouldRipCrossing override", () => {
    const { graph, connections } = createSingleCrossingGraph(1)
    const solver = new (class extends TestPartialRippingSolver {
      override shouldRipCrossing(
        _region: Region,
        _port1: RegionPort,
        _port2: RegionPort,
        assignment: RegionPortAssignment,
        _cost: number,
      ): boolean {
        return assignment.connection.connectionId === "connA"
      }

      override getPortUsagePenalty(port: RegionPort): number {
        return (port.ripCount ?? 0) * 100
      }
    })({
      inputGraph: graph,
      inputConnections: connections,
      ripCostThreshold: 100,
    })

    solver.solve()

    expect(solver.solved).toBe(true)
    expect(solver.rippedConnectionIds).toEqual(["connA"])
  })

  test("exposes solver name, defaults, and round-trips getConstructorParams", () => {
    const { graph, connections } = createSingleCrossingGraph(2)
    const defaultSolver = new HyperGraphPartialRipping({
      inputGraph: graph,
      inputConnections: connections,
    })

    expect(defaultSolver.getSolverName()).toBe("HyperGraphPartialRipping")
    expect(defaultSolver.ripCostThreshold).toBe(0)
    expect(defaultSolver.rippingEnabled).toBe(true)

    const configuredSolver = new HyperGraphPartialRipping({
      inputGraph: graph,
      inputConnections: connections,
      ripCostThreshold: 7.5,
      rippingEnabled: false,
      ripCost: 12,
    })

    const params = configuredSolver.getConstructorParams()
    expect(params.ripCostThreshold).toBe(7.5)
    expect(params.rippingEnabled).toBe(false)
    expect(params.ripCost).toBe(12)

    const clonedSolver = new HyperGraphPartialRipping(params)
    expect(clonedSolver.ripCostThreshold).toBe(7.5)
    expect(clonedSolver.rippingEnabled).toBe(false)
    expect(clonedSolver.ripCost).toBe(12)
  })
})
