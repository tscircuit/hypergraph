import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { ViaGraphSolver } from "lib/ViaGraphSolver/ViaGraphSolver"
import { createViaGraphWithConnections } from "lib/ViaGraphSolver/via-graph-generator/createViaGraphWithConnections"
import { generateViaTopologyRegions } from "lib/ViaGraphSolver/via-graph-generator/generateViaTopologyRegions"
import viaTile from "assets/ViaGraphSolver/via-tile.json"

const baseGraph = generateViaTopologyRegions(viaTile, {
  graphSize: 5,
  idPrefix: "via",
})

const graphWithConnections = createViaGraphWithConnections(baseGraph, [
  {
    start: { x: -2.5, y: 1.0 },
    end: { x: 2.5, y: 1.0 },
    connectionId: "P1",
  },
  {
    start: { x: -2.5, y: -1.0 },
    end: { x: 2.5, y: -1.0 },
    connectionId: "P2",
  },
])

export default () => (
  <GenericSolverDebugger
    createSolver={() =>
      new ViaGraphSolver({
        inputGraph: {
          regions: graphWithConnections.regions,
          ports: graphWithConnections.ports,
        },
        inputConnections: graphWithConnections.connections,
        viaTile,
      })
    }
  />
)
