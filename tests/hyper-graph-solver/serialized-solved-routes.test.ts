import { expect, test } from "bun:test"
import { HyperGraphSolver } from "lib/HyperGraphSolver"
import type {
  Connection,
  HyperGraph,
  Region,
  RegionPort,
  SerializedSolvedRoute,
  SolvedRoute,
} from "lib/types"

class TestHyperGraphSolver extends HyperGraphSolver {
  constructor(input: ConstructorParameters<typeof HyperGraphSolver>[0]) {
    super({
      rippingEnabled: true,
      ripCost: 100,
      ...input,
    })
  }

  override computeIncreasedRegionCostIfPortsAreUsed(
    region: Region,
    _port1: RegionPort,
    _port2: RegionPort,
  ): number {
    if (!region.d.exclusive) return 0

    return (region.assignments ?? []).length * 10
  }

  override getRipsRequiredForPortUsage(
    region: Region,
    _port1: RegionPort,
    _port2: RegionPort,
  ) {
    if (!region.d.exclusive) return []

    return (region.assignments ?? []).filter(
      (assignment) =>
        assignment.connection.mutuallyConnectedNetworkId !==
        this.currentConnection!.mutuallyConnectedNetworkId,
    )
  }
}

const createRegion = (
  regionId: string,
  d: Record<string, unknown> = {},
): Region => ({
  regionId,
  ports: [],
  d,
  assignments: [],
})

const connect = (
  portId: string,
  region1: Region,
  region2: Region,
  d: Record<string, unknown> = {},
): RegionPort => {
  const port: RegionPort = { portId, region1, region2, d }
  region1.ports.push(port)
  region2.ports.push(port)
  return port
}

const createConnection = (
  connectionId: string,
  startRegion: Region,
  endRegion: Region,
): Connection => ({
  connectionId,
  mutuallyConnectedNetworkId: connectionId,
  startRegion,
  endRegion,
})

const stepUntil = (
  solver: HyperGraphSolver,
  predicate: (solver: HyperGraphSolver) => boolean,
  maxSteps = 50,
) => {
  for (let i = 0; i < maxSteps && !solver.failed && !predicate(solver); i++) {
    solver.step()
  }
}

const createIndependentGraph = () => {
  const s1 = createRegion("s1")
  const m1 = createRegion("m1")
  const e1 = createRegion("e1")
  const s2 = createRegion("s2")
  const m2 = createRegion("m2")
  const e2 = createRegion("e2")

  const p1 = connect("p1", s1, m1)
  const p2 = connect("p2", m1, e1)
  const p3 = connect("p3", s2, m2)
  const p4 = connect("p4", m2, e2)

  const graph: HyperGraph = {
    regions: [s1, m1, e1, s2, m2, e2],
    ports: [p1, p2, p3, p4],
  }

  return {
    graph,
    connections: [
      createConnection("c1", s1, e1),
      createConnection("c2", s2, e2),
    ],
  }
}

const createConflictGraph = () => {
  const s1 = createRegion("s1")
  const s2 = createRegion("s2")
  const e1 = createRegion("e1")
  const e2 = createRegion("e2")
  const exclusive = createRegion("exclusive", { exclusive: true })
  const alternate = createRegion("alternate")

  const aIn = connect("a-in", s1, exclusive)
  const aOut = connect("a-out", exclusive, e1)
  const altIn = connect("alt-in", s1, alternate)
  const altOut = connect("alt-out", alternate, e1)
  const bIn = connect("b-in", s2, exclusive)
  const bOut = connect("b-out", exclusive, e2)

  const graph: HyperGraph = {
    regions: [s1, s2, e1, e2, exclusive, alternate],
    ports: [aIn, aOut, altIn, altOut, bIn, bOut],
  }

  const c1 = createConnection("c1", s1, e1)
  const c2 = createConnection("c2", s2, e2)

  const preloadedRoute: SerializedSolvedRoute = {
    connectionId: c1.connectionId,
    requiredRip: false,
    path: [
      {
        portId: aIn.portId,
        g: 0,
        h: 0,
        f: 0,
        hops: 0,
        ripRequired: false,
        nextRegionId: exclusive.regionId,
      },
      {
        portId: aOut.portId,
        g: 0,
        h: 0,
        f: 0,
        hops: 1,
        ripRequired: false,
        lastPortId: aIn.portId,
        lastRegionId: exclusive.regionId,
        nextRegionId: e1.regionId,
      },
    ],
  }

  return { graph, connections: [c1, c2], preloadedRoute }
}

test("serialized solvedRoutes resume partial progress", () => {
  const { graph, connections } = createIndependentGraph()
  const solver = new TestHyperGraphSolver({
    inputGraph: graph,
    inputConnections: connections,
  })

  stepUntil(solver, (current) => current.solvedRoutes.length === 1)

  expect(solver.solvedRoutes).toHaveLength(1)
  expect(solver.solved).toBe(false)

  const resumed = new TestHyperGraphSolver(solver.getConstructorParams())

  expect(resumed.solvedRoutes).toHaveLength(1)
  expect(resumed.solvedRoutes[0].connection.connectionId).toBe("c1")
  expect(resumed.solvedRoutes[0].path[1].parent).toBe(resumed.solvedRoutes[0].path[0])
  expect(resumed.currentConnection?.connectionId).toBe("c2")
  expect(resumed.unprocessedConnections).toHaveLength(0)

  resumed.solve()

  expect(resumed.solved).toBe(true)
  expect(resumed.solvedRoutes).toHaveLength(2)
})

test("serialized solvedRoutes can fully initialize solver as solved", () => {
  const { graph, connections } = createIndependentGraph()
  const solver = new TestHyperGraphSolver({
    inputGraph: graph,
    inputConnections: connections,
  })

  solver.solve()

  const resumed = new TestHyperGraphSolver(solver.getConstructorParams())

  expect(resumed.solved).toBe(true)
  expect(resumed.failed).toBe(false)
  expect(resumed.currentConnection).toBeNull()
  expect(resumed.solvedRoutes).toHaveLength(2)
})

test("rippable preloaded solvedRoutes can be ripped and rerouted", () => {
  const { graph, connections, preloadedRoute } = createConflictGraph()
  const solver = new TestHyperGraphSolver({
    inputGraph: graph,
    inputConnections: connections,
    solvedRoutes: [preloadedRoute],
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.solvedRoutes).toHaveLength(2)

  const c1Route = solver.solvedRoutes.find(
    (route) => route.connection.connectionId === "c1",
  ) as SolvedRoute
  const c2Route = solver.solvedRoutes.find(
    (route) => route.connection.connectionId === "c2",
  ) as SolvedRoute

  expect(c1Route.path.map((candidate) => candidate.port.portId)).toEqual([
    "alt-in",
    "alt-out",
  ])
  expect(c1Route.requiredRip).toBe(false)
  expect(c2Route.requiredRip).toBe(true)
})

test("locked preloaded solvedRoutes block conflicting routes", () => {
  const { graph, connections, preloadedRoute } = createConflictGraph()
  const solver = new TestHyperGraphSolver({
    inputGraph: graph,
    inputConnections: connections,
    solvedRoutes: [{ ...preloadedRoute, locked: true }],
  })

  solver.solve()

  expect(solver.solved).toBe(false)
  expect(solver.failed).toBe(true)
  expect(solver.error).toBe("Ran out of candidates")
  expect(solver.solvedRoutes).toHaveLength(1)
  expect(solver.solvedRoutes[0].locked).toBe(true)
})
