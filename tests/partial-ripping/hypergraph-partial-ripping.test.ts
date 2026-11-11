import { expect, test } from "bun:test"
import { HyperGraphPartialRipping } from "lib/HyperGraphPartialRipping"
import type {
  Region,
  RegionPort,
  RegionPortAssignment,
  SerializedConnection,
  SerializedHyperGraph,
  SolvedRoute,
} from "lib/types"

// S1 --p1-- M --p2-- E1
// S2 --p3-- M --p4-- E2
// Both connections cross inside the shared region M.
const graph: SerializedHyperGraph = {
  regions: [
    { regionId: "S1", pointIds: ["p1"], d: {} },
    { regionId: "S2", pointIds: ["p3"], d: {} },
    { regionId: "M", pointIds: ["p1", "p2", "p3", "p4"], d: {} },
    { regionId: "E1", pointIds: ["p2"], d: {} },
    { regionId: "E2", pointIds: ["p4"], d: {} },
  ],
  ports: [
    { portId: "p1", region1Id: "S1", region2Id: "M", d: {} },
    { portId: "p2", region1Id: "M", region2Id: "E1", d: {} },
    { portId: "p3", region1Id: "S2", region2Id: "M", d: {} },
    { portId: "p4", region1Id: "M", region2Id: "E2", d: {} },
  ],
}

const connections: SerializedConnection[] = [
  {
    connectionId: "c1",
    startRegionId: "S1",
    endRegionId: "E1",
    mutuallyConnectedNetworkId: "net1",
  },
  {
    connectionId: "c2",
    startRegionId: "S2",
    endRegionId: "E2",
    mutuallyConnectedNetworkId: "net2",
  },
]

const CROSSING_COST = 5

class CrossingSolver extends HyperGraphPartialRipping {
  override computeIncreasedRegionCostIfPortsAreUsed(
    region: Region,
    _port1: RegionPort,
    _port2: RegionPort,
  ): number {
    if (region.regionId !== "M") return 0
    return this.getRipsRequiredForPortUsage(region, _port1, _port2).length > 0
      ? CROSSING_COST
      : 0
  }

  override getRipsRequiredForPortUsage(
    region: Region,
    _port1: RegionPort,
    _port2: RegionPort,
  ): RegionPortAssignment[] {
    if (region.regionId !== "M") return []
    return (region.assignments ?? []).filter(
      (a) =>
        a.connection.mutuallyConnectedNetworkId !==
        this.currentConnection!.mutuallyConnectedNetworkId,
    )
  }
}

const presolvedC1 = {
  connection: { connectionId: "c1" },
  requiredRip: false,
  path: [
    {
      port: { portId: "p1" },
      g: 0,
      h: 0,
      f: 0,
      hops: 0,
      ripRequired: false,
      nextRegion: { regionId: "M" },
    },
    {
      port: { portId: "p2" },
      g: 0,
      h: 0,
      f: 0,
      hops: 1,
      ripRequired: false,
      lastPort: { portId: "p1" },
      lastRegion: { regionId: "M" },
      nextRegion: { regionId: "E1" },
    },
  ],
} as unknown as SolvedRoute

const runUntilC2Solved = (solver: CrossingSolver) => {
  for (let i = 0; i < 50; i++) {
    solver.step()
    if (solver.solvedRoutes.some((r) => r.connection.connectionId === "c2")) {
      return
    }
  }
  throw new Error("c2 was never solved")
}

test("crossing cost at or below threshold does not rip the crossed route", () => {
  const solver = new CrossingSolver({
    inputGraph: graph,
    inputConnections: connections,
    inputSolvedRoutes: [presolvedC1],
    ripCostThreshold: CROSSING_COST,
  })

  runUntilC2Solved(solver)

  expect(solver.solvedRoutes.map((r) => r.connection.connectionId)).toEqual([
    "c1",
    "c2",
  ])
  expect(solver.unprocessedConnections).toHaveLength(0)
  expect(solver.graph.ports.find((p) => p.portId === "p1")!.ripCount).toBe(
    undefined,
  )
})

test("crossing cost above threshold rips the crossed route and requeues it", () => {
  const solver = new CrossingSolver({
    inputGraph: graph,
    inputConnections: connections,
    inputSolvedRoutes: [presolvedC1],
    ripCostThreshold: CROSSING_COST - 1,
  })

  runUntilC2Solved(solver)

  expect(solver.solvedRoutes.map((r) => r.connection.connectionId)).toEqual([
    "c2",
  ])
  // c1 was requeued and immediately picked up as the current connection
  expect(solver.currentConnection?.connectionId).toBe("c1")
  expect(solver.graph.ports.find((p) => p.portId === "p1")!.ripCount).toBe(1)
})

test("ripCostThreshold is part of the constructor params", () => {
  const solver = new CrossingSolver({
    inputGraph: graph,
    inputConnections: connections,
    ripCostThreshold: 3,
  })
  expect(solver.getConstructorParams().ripCostThreshold).toBe(3)
  expect(solver.getSolverName()).toBe("HyperGraphPartialRipping")
})
