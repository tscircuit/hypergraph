import { expect, test } from "bun:test"
import {
  createRippingGraph,
  TestHyperGraphSolver,
} from "../fixtures/hypergraph-solved-routes"

test("preloaded solved routes can be ripped and requeued", () => {
  const { graph, connections } = createRippingGraph()

  const solver = new TestHyperGraphSolver({
    inputGraph: graph,
    inputConnections: [connections.connection1, connections.connection2],
    rippingEnabled: true,
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  const routeByConnectionId = new Map(
    solver.solvedRoutes.map((route) => [route.connection.connectionId, route]),
  )

  expect(
    routeByConnectionId
      .get("c2")
      ?.path.map((candidate) => candidate.port.portId),
  ).toEqual(["pAB", "pBC2"])
  expect(
    routeByConnectionId
      .get("c1")
      ?.path.map((candidate) => candidate.port.portId),
  ).toEqual(["pAC1"])
  expect(
    solver.solvedRoutes.some(
      (route) => route.connection.connectionId === "c2" && route.requiredRip,
    ),
  ).toBe(true)
})
