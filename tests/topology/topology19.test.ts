import { expect, test } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { visualizeJumperGraph } from "lib/JumperGraphSolver/visualizeJumperGraph"
import { Topology } from "lib/topology"

test("topology19 - connect polygon regions", () => {
  const topo = new Topology()

  const A = topo.region("A").polygon([
    { x: 1, y: 2 },
    { x: 1.5, y: 0.866 },
    { x: 2.5, y: 0.866 },
    { x: 3, y: 2 },
    { x: 2.5, y: 3.134 },
    { x: 1.5, y: 3.134 },
  ])
  const B = topo.region("B").polygon([
    { x: 3, y: 2 },
    { x: 3.5, y: 0.866 },
    { x: 4.5, y: 0.866 },
    { x: 5, y: 2 },
    { x: 4.5, y: 3.134 },
    { x: 3.5, y: 3.134 },
  ])

  topo.connect(A, B)

  const graph = topo.toJumperGraph()

  expect(graph.regions.map((r) => r.regionId).sort()).toEqual(["A", "B"])
  expect(graph.ports[0].portId).toBe("A-B")

  expect(
    getSvgFromGraphicsObject(visualizeJumperGraph(graph)),
  ).toMatchSvgSnapshot(import.meta.path)
})
