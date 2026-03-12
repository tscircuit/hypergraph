import { expect, test } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { HyperGraphSolver } from "lib/HyperGraphSolver"
import type { JPort, JRegion, SerializedHyperGraph } from "lib/index"
import { addRegionBoundsFromExactGeometry } from "../fixtures/addRegionBoundsFromExactGeometry"
import { deriveConnectionsFromSolvedRoutes } from "../fixtures/deriveConnectionsFromSolvedRoutes"
import { renderHyperGraphSolver } from "../fixtures/renderHyperGraphSolver"
import inputGraph from "./feature-testing-graphsolvedroutes.hypergraph-solved-routes.json"

test("feature-testing-graphsolvedroutes: visualize solved routes loaded from graph json", () => {
  const graphData = addRegionBoundsFromExactGeometry(
    inputGraph as SerializedHyperGraph,
  )
  const solver = new HyperGraphSolver<JRegion, JPort>({
    inputGraph: graphData,
    inputConnections: deriveConnectionsFromSolvedRoutes(graphData),
  })

  expect(
    getSvgFromGraphicsObject(renderHyperGraphSolver(solver)),
  ).toMatchSvgSnapshot(import.meta.path)
})
