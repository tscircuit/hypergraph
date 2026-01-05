import { test, expect } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { generateJumperGrid } from "lib/JumperGraphSolver/jumper-graph-generator/generateJumperGrid"
import { createGraphWithConnectionsFromBaseGraph } from "lib/JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import { visualizeJumperGraph } from "lib/JumperGraphSolver/visualizeJumperGraph"

test("jumper-graph-generation10: 2x2 grid with external connections", () => {
  // Create a base 2x2 grid
  const baseGraph = generateJumperGrid({
    cols: 2,
    rows: 2,
    marginX: 0.5,
    marginY: 0.5,
    xChannelPointCount: 1,
    yChannelPointCount: 1,
  })

  // Add external connections at various boundary positions
  const graphWithConnections = createGraphWithConnectionsFromBaseGraph(
    baseGraph,
    [
      {
        // Connection from left side to right side
        start: { x: -1.5, y: 0 },
        end: { x: 3.5, y: 0 },
        connectionId: "conn1",
      },
      {
        // Connection from top to bottom
        start: { x: 1.0, y: 1.5 },
        end: { x: 1.0, y: -3.5 },
        connectionId: "conn2",
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
