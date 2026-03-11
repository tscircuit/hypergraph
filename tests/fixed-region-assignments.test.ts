import { expect, test } from "bun:test"
import { HyperGraphSolver } from "lib/HyperGraphSolver"
import type {
  Connection,
  HyperGraph,
  Region,
  RegionPort,
  SerializedConnection,
  SerializedHyperGraph,
} from "lib/types"

class TestHyperGraphSolver extends HyperGraphSolver {
  override estimateCostToEnd(_port: RegionPort): number {
    return 0
  }

  override computeIncreasedRegionCostIfPortsAreUsed(
    _region: Region,
    _port1: RegionPort,
    _port2: RegionPort,
  ): number {
    return 0
  }
}

const createSerializedGraph = (): SerializedHyperGraph => ({
  regions: [
    { regionId: "start", pointIds: ["p1"], d: {} },
    {
      regionId: "middle",
      pointIds: ["p1", "p2", "p3"],
      d: {},
      assignments: [
        {
          regionPort1Id: "p1",
          regionPort2Id: "p3",
          connectionId: "fixed-obstacle",
        },
      ],
    },
    { regionId: "end", pointIds: ["p2"], d: {} },
    { regionId: "dummy", pointIds: ["p3"], d: {} },
  ],
  ports: [
    { portId: "p1", region1Id: "start", region2Id: "middle", d: {} },
    { portId: "p2", region1Id: "middle", region2Id: "end", d: {} },
    { portId: "p3", region1Id: "middle", region2Id: "dummy", d: {} },
  ],
})

const createSerializedConnections = (): SerializedConnection[] => [
  {
    connectionId: "route-1",
    startRegionId: "start",
    endRegionId: "end",
  },
]

test("fixed-region-assignments: fixed port occupancy blocks reuse", () => {
  const solver = new TestHyperGraphSolver({
    inputGraph: createSerializedGraph(),
    inputConnections: createSerializedConnections(),
  })

  solver.solve()

  expect(solver.failed).toBe(true)
  expect(solver.solved).toBe(false)
  expect(
    solver.graph.ports.find((port) => port.portId === "p1")?.fixedAssignments,
  ).toHaveLength(1)
})

test("fixed-region-assignments: active connection assignments are silently ignored", () => {
  const graph = createSerializedGraph()
  graph.regions[1].assignments = [
    {
      regionPort1Id: "p1",
      regionPort2Id: "p3",
      connectionId: "route-1",
    },
  ]

  const solver = new TestHyperGraphSolver({
    inputGraph: graph,
    inputConnections: createSerializedConnections(),
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(
    solver.graph.ports.find((port) => port.portId === "p1")?.fixedAssignments,
  ).toHaveLength(0)
})

test("fixed-region-assignments: constructor params preserve fixed assignments only", () => {
  const solver = new TestHyperGraphSolver({
    inputGraph: createSerializedGraph(),
    inputConnections: createSerializedConnections(),
  })

  const params = solver.getConstructorParams() as {
    inputGraph: SerializedHyperGraph
    inputConnections: (Connection | SerializedConnection)[]
  }

  expect(
    params.inputGraph.regions.find((region) => region.regionId === "middle"),
  ).toEqual({
    regionId: "middle",
    pointIds: ["p1", "p2", "p3"],
    d: {},
    assignments: [
      {
        regionPort1Id: "p1",
        regionPort2Id: "p3",
        connectionId: "fixed-obstacle",
      },
    ],
  })
})

test("fixed-region-assignments: live graph assignments are normalized into fixed obstacles", () => {
  const start: Region = { regionId: "start", ports: [], d: {} }
  const middle: Region = { regionId: "middle", ports: [], d: {} }
  const end: Region = { regionId: "end", ports: [], d: {} }
  const dummy: Region = { regionId: "dummy", ports: [], d: {} }

  const p1: RegionPort = {
    portId: "p1",
    region1: start,
    region2: middle,
    d: {},
  }
  const p2: RegionPort = { portId: "p2", region1: middle, region2: end, d: {} }
  const p3: RegionPort = {
    portId: "p3",
    region1: middle,
    region2: dummy,
    d: {},
  }

  start.ports.push(p1)
  middle.ports.push(p1, p2, p3)
  end.ports.push(p2)
  dummy.ports.push(p3)

  middle.assignments = [
    {
      regionPort1: p1,
      regionPort2: p3,
      region: middle,
      connection: {
        connectionId: "legacy-fixed",
        mutuallyConnectedNetworkId: "legacy-fixed",
        startRegion: middle,
        endRegion: middle,
      },
    },
  ]

  const graph: HyperGraph = {
    regions: [start, middle, end, dummy],
    ports: [p1, p2, p3],
  }

  const solver = new TestHyperGraphSolver({
    inputGraph: graph,
    inputConnections: createSerializedConnections(),
  })

  expect(
    solver.graph.regions.find((region) => region.regionId === "middle")
      ?.assignments?.[0]?.isFixed,
  ).toBe(true)
  expect(
    solver.graph.ports.find((port) => port.portId === "p1")?.fixedAssignments,
  ).toHaveLength(1)
})
