import { expect, test } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"
import repro01 from "./repro01.json"

test("repro01 svg snapshot", () => {
  const inputGraph = {
    ...repro01.inputGraph,
    ports: repro01.inputGraph.ports.map(({ regionIds, ...port }) => ({
      ...port,
      region1Id: regionIds[0],
      region2Id: regionIds[1],
    })),
  }

  const solver = new JumperGraphSolver({
    inputGraph: inputGraph as any,
    inputConnections: repro01.inputConnections,
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(getSvgFromGraphicsObject(solver.visualize())).toMatchSvgSnapshot(
    import.meta.path,
  )
})
