import { generate0603JumperHyperGraph } from "@tscircuit/jumper-topology-generator"
import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { JumperSectionOptimizationPipeline } from "lib/JumperGraphSolver/JumperSectionOptimizationPipeline"
import { createProblemFromBaseGraph } from "lib/JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"

const createSolver = () => {
  const baseGraph = generate0603JumperHyperGraph({
    rows: 5,
    cols: 5,
    orientation: "vertical",
    pattern: "grid",
    maxNeckRatio: 0.4,
    minSplitBalanceRatio: 0.2,
  })

  const graphWithConnections = createProblemFromBaseGraph({
    baseGraph,
    numCrossings: 2,
    randomSeed: 13,
  })

  return new JumperSectionOptimizationPipeline({
    inputGraph: {
      regions: graphWithConnections.regions,
      ports: graphWithConnections.ports,
    },
    inputConnections: graphWithConnections.connections,
    expansionHopsFromCentralRegion: 1,
    maxAttemptsPerRegion: 1,
    sectionMaxIterations: 200_000,
  })
}

export default () => <GenericSolverDebugger createSolver={createSolver} />
