import { expect, test } from "bun:test"
import { generate0603JumperHyperGraph } from "@tscircuit/jumper-topology-generator"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"
import { JumperSectionOptimizationPipeline } from "lib/JumperGraphSolver/JumperSectionOptimizationPipeline"
import { createProblemFromBaseGraph } from "lib/JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"

test(
  "assignments should not be empty after section optimization",
  {
    // @ts-expect-error bun:test types don't include timeout option
    timeout: 30000,
  },
  () => {
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

    // Check assignments after initial solve
    let totalAssignmentsAfterInitial = 0
    for (const region of initialSolver.graph.regions) {
      if (region.assignments) {
        totalAssignmentsAfterInitial += region.assignments.length
      }
    }
    console.log(
      `Total assignments after initial solve: ${totalAssignmentsAfterInitial}`,
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

    // Re-hydrate routes into a fresh solver graph to validate assignments
    // against the actual pipeline output graph state.
    const optimizedSolver = new JumperGraphSolver({
      inputGraph: {
        regions: graphWithConnections.regions,
        ports: graphWithConnections.ports,
      },
      inputConnections: graphWithConnections.connections,
      inputSolvedRoutes: optimizedRoutes!,
    })

    console.log(`\n=== Checking final assignments in jumper solver ===`)
    console.log(
      `Optimized solver graph has ${optimizedSolver.graph.regions.length} regions`,
    )
    console.log(
      `Optimized solver has ${optimizedSolver.solvedRoutes.length} solved routes`,
    )

    // Check assignments after section optimization
    let totalAssignmentsAfterOptimization = 0
    let regionsWithAssignments = 0
    let regionsWithEmptyAssignments = 0

    for (const region of optimizedSolver.graph.regions) {
      console.log(
        `Region ${region.regionId} has ${region.assignments?.length ?? "undefined"} assignments`,
      )
      if (region.assignments === undefined) {
        console.log(
          `  WARNING: Region ${region.regionId} has undefined assignments!`,
        )
      } else if (region.assignments.length === 0) {
        regionsWithEmptyAssignments++
      } else {
        regionsWithAssignments++
        totalAssignmentsAfterOptimization += region.assignments.length
      }
    }

    console.log(`\nSummary:`)
    console.log(
      `  Total assignments after optimization: ${totalAssignmentsAfterOptimization}`,
    )
    console.log(`  Regions with assignments: ${regionsWithAssignments}`)
    console.log(
      `  Regions with empty assignments: ${regionsWithEmptyAssignments}`,
    )

    // Section optimization can reduce hop count, so assignment count may drop.
    expect(totalAssignmentsAfterOptimization).toBeGreaterThan(0)
    expect(optimizedSolver.solvedRoutes).toHaveLength(
      graphWithConnections.connections.length,
    )
  },
)
