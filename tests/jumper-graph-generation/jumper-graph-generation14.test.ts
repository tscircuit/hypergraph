import { test, expect } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { generateJumperX4Grid } from "lib/JumperGraphSolver/jumper-graph-generator/generateJumperX4Grid"
import { visualizeJumperGraph } from "lib/JumperGraphSolver/visualizeJumperGraph"

test("jumper-graph-generation14: 2x2 X4 grid with horizontal orientation and bounds", () => {
  const bounds = { minX: 0, maxX: 25, minY: 0, maxY: 25 }

  const graph = generateJumperX4Grid({
    cols: 2,
    rows: 2,
    outerChannelYPointCount: 5,
    outerChannelXPointCount: 5,
    innerColChannelPointCount: 3,
    innerRowChannelPointCount: 2,
    marginX: 1,
    marginY: 1,
    orientation: "horizontal",
    bounds,
  })

  // Verify the graph fits within the specified bounds after orientation change
  const graphBounds = getBounds(graph.regions)

  // The graph should respect the specified bounds
  expect(graphBounds.minX).toBeGreaterThanOrEqual(bounds.minX - 0.001)
  expect(graphBounds.maxX).toBeLessThanOrEqual(bounds.maxX + 0.001)
  expect(graphBounds.minY).toBeGreaterThanOrEqual(bounds.minY - 0.001)
  expect(graphBounds.maxY).toBeLessThanOrEqual(bounds.maxY + 0.001)

  // Also check the dimensions match
  const width = graphBounds.maxX - graphBounds.minX
  const height = graphBounds.maxY - graphBounds.minY
  expect(width).toBeCloseTo(25, 5)
  expect(height).toBeCloseTo(25, 5)

  expect(
    getSvgFromGraphicsObject(visualizeJumperGraph(graph)),
  ).toMatchSvgSnapshot(import.meta.path)
})

function getBounds(
  regions: {
    d: { bounds: { minX: number; maxX: number; minY: number; maxY: number } }
  }[],
) {
  return {
    minX: Math.min(...regions.map((r) => r.d.bounds.minX)),
    maxX: Math.max(...regions.map((r) => r.d.bounds.maxX)),
    minY: Math.min(...regions.map((r) => r.d.bounds.minY)),
    maxY: Math.max(...regions.map((r) => r.d.bounds.maxY)),
  }
}
