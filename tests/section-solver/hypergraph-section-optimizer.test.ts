import { expect, test } from "bun:test"
import { generate0603JumperHyperGraph } from "@tscircuit/jumper-topology-generator"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { computeBoardCost } from "lib/HyperGraphSectionOptimizer/computeBoardCost"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"
import { JumperSectionOptimizationPipeline } from "lib/JumperGraphSolver/JumperSectionOptimizationPipeline"
import { createProblemFromBaseGraph } from "lib/JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"

const getTotalScore = (solver: JumperGraphSolver) => {
  return computeBoardCost(solver)
}

test("score should be lower", {
  // @ts-expect-error bun:test types don't include timeout option
  timeout: 30000,
}, () => {
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

  const initialSolver = new JumperGraphSolver({
    inputGraph: {
      regions: graphWithConnections.regions,
      ports: graphWithConnections.ports,
    },
    inputConnections: graphWithConnections.connections,
  })
  initialSolver.solve()
  const initialScore = getTotalScore(initialSolver)

  const pipeline = new JumperSectionOptimizationPipeline({
    inputGraph: {
      regions: graphWithConnections.regions,
      ports: graphWithConnections.ports,
    },
    inputConnections: graphWithConnections.connections,
    expansionHopsFromCentralRegion: 1,
    maxAttemptsPerRegion: 1,
    sectionMaxIterations: 200_000,
  })

  pipeline.solve()
  expect(pipeline.solved).toBe(true)

  const optimizedRoutes = pipeline.getOutput()!
  const optimizedSolver = new JumperGraphSolver({
    inputGraph: {
      regions: graphWithConnections.regions,
      ports: graphWithConnections.ports,
    },
    inputConnections: graphWithConnections.connections,
    inputSolvedRoutes: optimizedRoutes,
  })
  const optimizedScore = getTotalScore(optimizedSolver)
  expect(optimizedScore).toBeLessThan(initialScore)

  const mergedSvg = getSvgFromGraphicsObject(pipeline.finalVisualize()!)
  expect(mergedSvg.includes("<svg")).toBe(true)
  expect(optimizedSolver.solvedRoutes).toHaveLength(
    graphWithConnections.connections.length,
  )
})
