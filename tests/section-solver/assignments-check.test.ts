import { expect, test } from "bun:test"
import { generate0603JumperHyperGraph } from "@tscircuit/jumper-topology-generator"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"
import { JumperSectionOptimizationPipeline } from "lib/JumperGraphSolver/JumperSectionOptimizationPipeline"
import { createProblemFromBaseGraph } from "lib/JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"

test("assignments should not be empty after section optimization", {
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
    baseGraph: baseGraph as any,
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

  const totalAssignmentsAfterInitial = initialSolver.graph.regions.reduce(
    (sum, region) => sum + (region.assignments?.length ?? 0),
    0,
  )
  expect(totalAssignmentsAfterInitial).toBeGreaterThan(0)

  const pipeline = new JumperSectionOptimizationPipeline({
    inputGraph: {
      regions: graphWithConnections.regions,
      ports: graphWithConnections.ports,
    },
    inputConnections: graphWithConnections.connections,
    expansionHopsFromCentralRegion: 1,
    maxAttemptsPerRegion: 1,
    sectionMaxIterations: 200_000,
    ACCEPTABLE_COST: 0,
  })

  pipeline.solve()
  expect(pipeline.solved).toBe(true)

  const optimizedRoutes = pipeline.getOutput()
  expect(optimizedRoutes).toBeDefined()

  const optimizedSolver = new JumperGraphSolver({
    inputGraph: {
      regions: graphWithConnections.regions,
      ports: graphWithConnections.ports,
    },
    inputConnections: graphWithConnections.connections,
    inputSolvedRoutes: optimizedRoutes!,
  })

  const totalAssignmentsAfterOptimization =
    optimizedSolver.graph.regions.reduce(
      (sum, region) => sum + (region.assignments?.length ?? 0),
      0,
    )

  expect(totalAssignmentsAfterOptimization).toBeGreaterThan(0)
  expect(optimizedSolver.solvedRoutes).toHaveLength(
    graphWithConnections.connections.length,
  )
})
