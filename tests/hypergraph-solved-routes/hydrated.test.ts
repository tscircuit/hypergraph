import { expect, test } from "bun:test"
import {
  createBootstrapGraph,
  createSharedPortBootstrapGraph,
  DisallowBootstrapTransitionSolver,
  TestHyperGraphSolver,
} from "../fixtures/hypergraph-solved-routes"

test("bootstraps solved routes from hydrated input graph", () => {
  const { graph, ports, connections, regions } = createBootstrapGraph()

  const solver = new TestHyperGraphSolver({
    inputGraph: graph,
    inputConnections: [connections.connection1, connections.connection2],
  })

  expect(solver.solvedRoutes).toHaveLength(1)
  expect(solver.solvedRoutes[0].connection.connectionId).toBe("c1")
  expect(solver.currentConnection?.connectionId).toBe("c2")
  expect(solver.unprocessedConnections).toHaveLength(0)
  expect(ports.portAB.assignment?.connection.connectionId).toBe("c1")
  expect(ports.portBC.assignment?.connection.connectionId).toBe("c1")
  expect(regions.regionB.assignments).toHaveLength(1)

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.solvedRoutes.map((route) => route.connection.connectionId)).toEqual(
    ["c1", "c2"],
  )
  expect(ports.portAD.assignment?.connection.connectionId).toBe("c2")
})

test("rejects duplicate hydrated solved routes for the same connection", () => {
  const { graph, connections } = createBootstrapGraph()
  graph.solvedRoutes!.push({
    portPoints: [...graph.solvedRoutes![0].portPoints],
    connection: connections.connection1,
  })

  expect(
    () =>
      new TestHyperGraphSolver({
        inputGraph: graph,
        inputConnections: [connections.connection1, connections.connection2],
      }),
  ).toThrow("Duplicate solved route for connection c1 in input graph")
})

test("rejects hydrated solved routes that violate transition constraints", () => {
  const { graph, connections } = createBootstrapGraph()

  expect(
    () =>
      new DisallowBootstrapTransitionSolver({
        inputGraph: graph,
        inputConnections: [connections.connection1, connections.connection2],
      }),
  ).toThrow(
    "Solved route c1 has disallowed transition in region B from pAB to pBC",
  )
})

test("rejects same-network hydrated solved routes that share a port", () => {
  const { graph, connections } = createSharedPortBootstrapGraph()

  expect(
    () =>
      new TestHyperGraphSolver({
        inputGraph: graph,
        inputConnections: [connections.connection1, connections.connection2],
      }),
  ).toThrow(
    "Solved route c2 reuses port pAB, but shared-port solved routes are not supported because RegionPort stores only one assignment",
  )
})
