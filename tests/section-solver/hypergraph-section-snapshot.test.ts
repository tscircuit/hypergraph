import { expect, test } from "bun:test"
import { generate0603JumperHyperGraph } from "@tscircuit/jumper-topology-generator"
import {
  getSvgFromGraphicsObject,
  stackGraphicsVertically,
} from "graphics-debug"
import {
  computeBoardCost,
  computeRegionCost,
} from "lib/HyperGraphSectionOptimizer/computeBoardCost"
import { HyperGraphSectionOptimizer } from "lib/HyperGraphSectionOptimizer/HyperGraphSectionOptimizer"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"
import { createProblemFromBaseGraph } from "lib/JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"
import type { JumperGraph } from "lib/JumperGraphSolver/jumper-types"
import { visualizeJumperGraphWithSolvedRoutes } from "lib/JumperGraphSolver/visualizeJumperGraphSolver"

test("capture mid-section visualization for the section optimizer", async () => {
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

  const initialCost = computeBoardCost(initialSolver)
  console.log(`Initial board cost: ${initialCost}`)

  const optimizer = new HyperGraphSectionOptimizer({
    sourceSolver: initialSolver,
    inputSolvedRoutes: initialSolver.solvedRoutes,
    expansionHopsFromCentralRegion: 1,
    maxAttemptsPerRegion: 1,
    createHyperGraphSolver: (input) => new JumperGraphSolver(input),
    computeRegionCost,
    regionScore: computeRegionCost,
  })

  optimizer.step()
  optimizer.step()
  optimizer.step()
  optimizer.step()

  const midCost = computeBoardCost(initialSolver)
  console.log(`After 4 steps board cost: ${midCost}`)

  const section = optimizer.activeSection
  expect(section).not.toBeNull()

  const sectionGraph: JumperGraph = {
    regions: section!.graph.regions as JumperGraph["regions"],
    ports: section!.graph.ports as JumperGraph["ports"],
  }

  const startGraphics = visualizeJumperGraphWithSolvedRoutes({
    graph: {
      regions: initialSolver.graph.regions as JumperGraph["regions"],
      ports: initialSolver.graph.ports as JumperGraph["ports"],
    },
    connections: initialSolver.connections,
    solvedRoutes: initialSolver.solvedRoutes,
    title: "Section start",
  })

  const middleGraphics = visualizeJumperGraphWithSolvedRoutes({
    graph: sectionGraph,
    connections: section!.connections,
    solvedRoutes: section!.routeDescriptors.map(
      (descriptor) => descriptor.localSolvedRoute,
    ),
    title: "Section snapshot",
  })

  // Continue optimization until solved or max iterations
  optimizer.solve()
  console.log(
    `Optimizer solved: ${optimizer.solved}, failed: ${optimizer.failed}`,
  )

  const finalCost = computeBoardCost(initialSolver)
  console.log(`Final board cost after optimization: ${finalCost}`)
  console.log(
    `Cost improvement: ${initialCost} -> ${finalCost} (saved ${initialCost - finalCost} jumpers)`,
  )

  const solvedGraphics = visualizeJumperGraphWithSolvedRoutes({
    graph: {
      regions: initialSolver.graph.regions as JumperGraph["regions"],
      ports: initialSolver.graph.ports as JumperGraph["ports"],
    },
    connections: initialSolver.connections,
    solvedRoutes: initialSolver.solvedRoutes,
    title: "After optimization",
  })

  const graphics = stackGraphicsVertically([
    startGraphics,
    middleGraphics,
    solvedGraphics,
  ])

  await expect(getSvgFromGraphicsObject(graphics)).toMatchSvgSnapshot(
    import.meta.path,
  )
})
