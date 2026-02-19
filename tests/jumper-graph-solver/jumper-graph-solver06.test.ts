import { expect, test } from "bun:test"
import { convertHyperGraphToSerializedHyperGraph } from "lib/convertHyperGraphToSerializedHyperGraph"
import { convertSerializedHyperGraphToHyperGraph } from "lib/convertSerializedHyperGraphToHyperGraph"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"
import { createGraphWithConnectionsFromBaseGraph } from "lib/JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import { generateJumperX4Grid } from "lib/JumperGraphSolver/jumper-graph-generator/generateJumperX4Grid"

const createSampleGraph = () => {
  const baseGraph = generateJumperX4Grid({
    cols: 1,
    rows: 1,
    marginX: 0.5,
    marginY: 0.5,
    outerPaddingX: 0.8,
    outerPaddingY: 0.8,
    regionsBetweenPads: true,
  })

  return createGraphWithConnectionsFromBaseGraph(baseGraph, [
    {
      start: { x: -2.55, y: 1.0 },
      end: { x: 2.55, y: -1.0 },
      connectionId: "A",
    },
    {
      start: { x: 0, y: 2.955 },
      end: { x: -2.55, y: -1.0 },
      connectionId: "B",
    },
    {
      start: { x: 0, y: -2.955 },
      end: { x: 2.55, y: 1.0 },
      connectionId: "C",
    },
  ])
}

test("jumper-graph-solver06: enforce region capacity on pads and through-jumpers", () => {
  const graphWithConnections = createSampleGraph()

  const solver = new JumperGraphSolver({
    inputGraph: {
      regions: graphWithConnections.regions,
      ports: graphWithConnections.ports,
    },
    inputConnections: graphWithConnections.connections,
  })

  solver.solve()
  expect(solver.solved).toBe(true)

  for (const region of solver.graph.regions) {
    if (region.capacity === undefined) continue

    const usedNetworkIds = new Set(
      (region.assignments ?? []).map(
        (a) => a.connection.mutuallyConnectedNetworkId,
      ),
    )
    expect(usedNetworkIds.size).toBeLessThanOrEqual(region.capacity)
  }
})

test("jumper-graph-solver06: rejects invalid region capacities", () => {
  const graphWithConnections = createSampleGraph()
  graphWithConnections.regions[0].capacity = 0

  expect(
    () =>
      new JumperGraphSolver({
        inputGraph: {
          regions: graphWithConnections.regions,
          ports: graphWithConnections.ports,
        },
        inputConnections: graphWithConnections.connections,
      }),
  ).toThrow("invalid capacity")
})

test("jumper-graph-solver06: preserves region capacity through serialization", () => {
  const graphWithConnections = createSampleGraph()

  const serialized = convertHyperGraphToSerializedHyperGraph({
    regions: graphWithConnections.regions,
    ports: graphWithConnections.ports,
  })

  const hydrated = convertSerializedHyperGraphToHyperGraph(serialized)

  const originalCapacityByRegion = new Map(
    graphWithConnections.regions.map((region) => [
      region.regionId,
      region.capacity,
    ]),
  )

  for (const region of hydrated.regions) {
    expect(region.capacity).toBe(originalCapacityByRegion.get(region.regionId))
  }
})
