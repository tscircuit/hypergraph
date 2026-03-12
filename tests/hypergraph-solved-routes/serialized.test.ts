import { expect, test } from "bun:test"
import { convertConnectionsToSerializedConnections } from "lib/convertConnectionsToSerializedConnections"
import { convertHyperGraphToSerializedHyperGraph } from "lib/convertHyperGraphToSerializedHyperGraph"
import {
  createBootstrapConflictGraph,
  createBootstrapGraph,
  ExclusiveRegionBootstrapSolver,
  TestHyperGraphSolver,
} from "../fixtures/hypergraph-solved-routes"

test("serializes and bootstraps solved routes from serialized input graph", () => {
  const { graph, connections } = createBootstrapGraph()
  const serializedGraph = convertHyperGraphToSerializedHyperGraph(graph)
  const serializedConnections = convertConnectionsToSerializedConnections([
    connections.connection1,
    connections.connection2,
  ])

  expect(serializedGraph.solvedRoutes).toEqual([
    {
      pathPortIds: ["pAB", "pBC"],
      connectionId: "c1",
    },
  ])

  const solver = new TestHyperGraphSolver({
    inputGraph: serializedGraph,
    inputConnections: serializedConnections,
  })

  expect(solver.solvedRoutes).toHaveLength(1)
  expect(
    solver.solvedRoutes[0].path.map((candidate) => candidate.port.portId),
  ).toEqual(["pAB", "pBC"])
  expect(solver.getConstructorParams().inputGraph.solvedRoutes).toEqual([
    {
      pathPortIds: ["pAB", "pBC"],
      connectionId: "c1",
    },
  ])
})

test("rejects duplicate serialized solved routes for the same connection", () => {
  const { graph, connections } = createBootstrapGraph()
  const serializedGraph = convertHyperGraphToSerializedHyperGraph(graph)
  const serializedConnections = convertConnectionsToSerializedConnections([
    connections.connection1,
    connections.connection2,
  ])

  serializedGraph.solvedRoutes!.push({
    pathPortIds: ["pAB", "pBC"],
    connectionId: "c1",
  })

  expect(
    () =>
      new TestHyperGraphSolver({
        inputGraph: serializedGraph,
        inputConnections: serializedConnections,
      }),
  ).toThrow("Duplicate solved route for connection c1 in input graph")
})

test("rejects serialized solved routes that would require ripping", () => {
  const { graph, connections } = createBootstrapConflictGraph()
  const serializedGraph = convertHyperGraphToSerializedHyperGraph(graph)
  const serializedConnections = convertConnectionsToSerializedConnections([
    connections.connection1,
    connections.connection2,
  ])

  expect(
    () =>
      new ExclusiveRegionBootstrapSolver({
        inputGraph: serializedGraph,
        inputConnections: serializedConnections,
      }),
  ).toThrow("Solved route c2 requires ripping conflicting assignments in region B")
})

test("serializes current solved routes after solving with preloaded routes", () => {
  const { graph, connections } = createBootstrapGraph()

  const solver = new TestHyperGraphSolver({
    inputGraph: graph,
    inputConnections: [connections.connection1, connections.connection2],
  })

  solver.solve()

  expect(solver.getConstructorParams().inputGraph.solvedRoutes).toEqual([
    {
      pathPortIds: ["pAB", "pBC"],
      connectionId: "c1",
    },
    {
      pathPortIds: ["pAD"],
      connectionId: "c2",
    },
  ])
})
