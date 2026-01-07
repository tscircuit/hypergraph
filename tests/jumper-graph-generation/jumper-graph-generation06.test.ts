import { test, expect } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { generateSingleJumperX4Regions } from "lib/JumperGraphSolver/jumper-graph-generator/generateSingleJumperX4Regions"
import { visualizeJumperGraph } from "lib/JumperGraphSolver/visualizeJumperGraph"

test("jumper-graph-generation06 - 1206x4 with regionsBetweenPads", () => {
  const singleJumperX4Topology = generateSingleJumperX4Regions({
    center: { x: 0, y: 0 },
    idPrefix: "jumperX4",
    regionsBetweenPads: true,
  })
  expect(
    getSvgFromGraphicsObject(visualizeJumperGraph(singleJumperX4Topology)),
  ).toMatchSvgSnapshot(import.meta.path)
})
