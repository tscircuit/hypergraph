import { expect, test } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { ViaGraphSolver } from "lib/ViaGraphSolver/ViaGraphSolver"
import { createViaGraphWithConnections } from "lib/ViaGraphSolver/via-graph-generator/createViaGraphWithConnections"
import { generateViaTopologyRegions } from "lib/ViaGraphSolver/via-graph-generator/generateViaTopologyRegions"
import viaTile from "assets/ViaGraphSolver/via-tile.json"

test("via-graph-solver03: 2 parallel left-to-right connections (via exclusivity test)", () => {
  const baseGraph = generateViaTopologyRegions(viaTile, {
    graphSize: 5,
    idPrefix: "via",
  })

  // Two connections going left-to-right at different Y positions.
  // They must use different via regions even though they travel
  // in the same direction.
  const graphWithConnections = createViaGraphWithConnections(baseGraph, [
    {
      start: { x: -2.5, y: 1.0 },
      end: { x: 2.5, y: 1.0 },
      connectionId: "P1",
    },
    {
      start: { x: -2.5, y: -1.0 },
      end: { x: 2.5, y: -1.0 },
      connectionId: "P2",
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

  // Verify via region exclusivity: no via region used by both connections
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
