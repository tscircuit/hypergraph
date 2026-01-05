import { test, expect } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { generateJumperX4Grid } from "lib/JumperGraphSolver/jumper-graph-generator/generateJumperX4Grid"
import { createGraphWithConnectionsFromBaseGraph } from "lib/JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import { visualizeJumperGraph } from "lib/JumperGraphSolver/visualizeJumperGraph"

test("jumper-graph-generation11: 1x1 X4 grid with external connections", () => {
  // Create a 1x1 X4 grid
  const baseGraph = generateJumperX4Grid({
    cols: 1,
    rows: 1,
    marginX: 0.5,
    marginY: 0.5,
    outerPaddingX: 0.8,
    outerPaddingY: 0.8,
  })

  // Add external connections at the boundary
  const graphWithConnections = createGraphWithConnectionsFromBaseGraph(
    baseGraph,
    [
      {
        // Connection from top-left outside to bottom-right outside
        start: { x: -2.55, y: 1.0 },
        end: { x: 2.55, y: -1.0 },
        connectionId: "A",
      },
      {
        // Connection from top outside to left outside
        start: { x: 0, y: 2.955 },
        end: { x: -2.55, y: -1.0 },
        connectionId: "B",
      },
      {
        // Connection from bottom outside to right outside
        start: { x: 0, y: -2.955 },
        end: { x: 2.55, y: 1.0 },
        connectionId: "C",
      },
    ],
  )

  expect(
    getSvgFromGraphicsObject(
      visualizeJumperGraph(graphWithConnections, {
        connections: graphWithConnections.connections,
      }),
    ),
  ).toMatchSvgSnapshot(import.meta.path)
})
