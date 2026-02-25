import { expect, test } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { ViaGraphSolver } from "lib/ViaGraphSolver/ViaGraphSolver"
import { createViaGraphWithConnections } from "lib/ViaGraphSolver/via-graph-generator/createViaGraphWithConnections"
import { generateViaTopologyRegions } from "lib/ViaGraphSolver/via-graph-generator/generateViaTopologyRegions"
import viaTile from "assets/ViaGraphSolver/via-tile.json"

test("via-graph-solver04: 4 connections one per side (saturated graph)", () => {
  const baseGraph = generateViaTopologyRegions(viaTile, {
    graphSize: 5,
    idPrefix: "via",
  })

  // Four connections, one entering from each side of the graph.
  // All four via regions will be needed, saturating the graph.
  const graphWithConnections = createViaGraphWithConnections(baseGraph, [
    {
      start: { x: -2.5, y: 0.5 },
      end: { x: 2.5, y: 0.5 },
      connectionId: "LR",
    },
    {
      start: { x: 2.5, y: -0.5 },
      end: { x: -2.5, y: -0.5 },
      connectionId: "RL",
    },
    {
      start: { x: 0.5, y: 2.5 },
      end: { x: 0.5, y: -2.5 },
      connectionId: "TB",
    },
    {
      start: { x: -0.5, y: -2.5 },
      end: { x: -0.5, y: 2.5 },
      connectionId: "BT",
    },
  ])

  const solver = new ViaGraphSolver({
    inputGraph: {
      regions: graphWithConnections.regions,
      ports: graphWithConnections.ports,
    },
    inputConnections: graphWithConnections.connections,
    viaTile,
  })

  solver.solve()

  expect(solver.solved).toBe(true)

  // Verify via region exclusivity
  for (const region of graphWithConnections.regions) {
    if (!region.d.isViaRegion) continue
    const assignments = region.assignments ?? []
    const connectionIds = new Set(
      assignments.map((a) => a.connection.connectionId),
    )
    expect(connectionIds.size).toBeLessThanOrEqual(1)
  }

  expect(getSvgFromGraphicsObject(solver.visualize())).toMatchSvgSnapshot(
    import.meta.path,
  )
})
