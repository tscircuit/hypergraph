import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"
import repro01 from "../../tests/repros/repro01/repro01.json"

const inputGraph = {
  ...repro01.inputGraph,
  ports: repro01.inputGraph.ports.map(({ region1Id, region2Id, ...port }) => ({
    ...port,
    region1Id,
    region2Id,
  })),
}

export default () => (
  <GenericSolverDebugger
    createSolver={() =>
      new JumperGraphSolver({
        inputGraph: inputGraph as any,
        inputConnections: repro01.inputConnections,
      })
    }
  />
)
