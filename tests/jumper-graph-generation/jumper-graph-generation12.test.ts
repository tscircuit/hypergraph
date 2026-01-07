import { test, expect } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { generateJumperX4Grid } from "lib/JumperGraphSolver/jumper-graph-generator/generateJumperX4Grid"
import { visualizeJumperGraph } from "lib/JumperGraphSolver/visualizeJumperGraph"

test("jumper-graph-generation12: 2x2 X4 grid with horizontal orientation", () => {
  // Create a 2x2 X4 grid with horizontal orientation (rotated 90 degrees)
  const graph = generateJumperX4Grid({
    cols: 2,
    rows: 2,
    marginX: 0.5,
    marginY: 0.5,
    outerPaddingX: 0.5,
    outerPaddingY: 0.5,
    orientation: "horizontal",
    center: { x: 0, y: 0 },
  })

  expect(
    getSvgFromGraphicsObject(visualizeJumperGraph(graph)),
  ).toMatchSvgSnapshot(import.meta.path)
})

test("jumper-graph-generation12: 2x2 X4 grid vertical vs horizontal comparison", () => {
  const params = {
    cols: 2,
    rows: 2,
    marginX: 0.5,
    marginY: 0.5,
    outerPaddingX: 0.5,
    outerPaddingY: 0.5,
  }

  // Create vertical (default) and horizontal versions
  const verticalGraph = generateJumperX4Grid({
    ...params,
    orientation: "vertical",
    center: { x: 0, y: 0 },
  })

  const horizontalGraph = generateJumperX4Grid({
    ...params,
    orientation: "horizontal",
    center: { x: 0, y: 0 },
  })

  // Vertical should have width > height, horizontal should have height > width
  const vBounds = getBounds(verticalGraph.regions)
  const hBounds = getBounds(horizontalGraph.regions)

  const vWidth = vBounds.maxX - vBounds.minX
  const vHeight = vBounds.maxY - vBounds.minY
  const hWidth = hBounds.maxX - hBounds.minX
  const hHeight = hBounds.maxY - hBounds.minY

  // After 90 degree rotation, dimensions should swap (with floating point tolerance)
  expect(Math.abs(vWidth - hHeight)).toBeLessThan(0.001)
  expect(Math.abs(vHeight - hWidth)).toBeLessThan(0.001)
})

test("jumper-graph-generation12: 2x2 X4 grid with custom center", () => {
  const customCenter = { x: 10, y: 20 }
  const graph = generateJumperX4Grid({
    cols: 2,
    rows: 2,
    marginX: 0.5,
    marginY: 0.5,
    outerPaddingX: 0.5,
    outerPaddingY: 0.5,
    center: customCenter,
  })

  const bounds = getBounds(graph.regions)
  const actualCenterX = (bounds.minX + bounds.maxX) / 2
  const actualCenterY = (bounds.minY + bounds.maxY) / 2

  expect(Math.abs(actualCenterX - customCenter.x)).toBeLessThan(0.001)
  expect(Math.abs(actualCenterY - customCenter.y)).toBeLessThan(0.001)
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
