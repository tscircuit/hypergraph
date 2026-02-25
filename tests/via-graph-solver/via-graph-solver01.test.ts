import { expect, test } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { ViaGraphSolver } from "lib/ViaGraphSolver/ViaGraphSolver"
import { createViaGraphWithConnections } from "lib/ViaGraphSolver/via-graph-generator/createViaGraphWithConnections"
import { generateViaTopologyRegions } from "lib/ViaGraphSolver/via-graph-generator/generateViaTopologyRegions"
import viaTile from "assets/ViaGraphSolver/via-tile.json"

test("via-graph-solver01: solve via topology with 3 perimeter connections", () => {
  const baseGraph = generateViaTopologyRegions(viaTile, {
    graphSize: 5,
    idPrefix: "via",
  })

  const graphWithConnections = createViaGraphWithConnections(baseGraph, [
    {
      start: { x: -2.5, y: 1.0 },
      end: { x: 2.5, y: -1.0 },
      connectionId: "A",
    },
    {
      start: { x: 0, y: 2.5 },
      end: { x: -2.5, y: -1.0 },
      connectionId: "B",
    },
    {
      start: { x: 0, y: -2.5 },
      end: { x: 2.5, y: 1.0 },
      connectionId: "C",
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

  expect(getSvgFromGraphicsObject(solver.visualize())).toMatchSvgSnapshot(
    import.meta.path,
  )
})
