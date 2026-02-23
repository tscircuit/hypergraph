import { expect, test } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"
import repro01 from "./repro01.json"

test.skip("repro01 svg snapshot", () => {
  const inputGraph = repro01.inputGraph

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
