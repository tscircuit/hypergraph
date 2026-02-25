import { expect, test } from "bun:test"
import { generate0603JumperHyperGraph } from "@tscircuit/jumper-topology-generator"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"
import { createProblemFromBaseGraph } from "lib/JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"
import type { JumperGraph } from "lib/JumperGraphSolver/jumper-types"

test.skip(
  "jumper-graph-solver07: solve generated 0603 staggered 3x2 grid",
  // @ts-expect-error bun:test types don't include timeout option
  { timeout: 30000 },
  () => {
    const baseGraph = generate0603JumperHyperGraph({
      rows: 3,
      cols: 2,
      orientation: "horizontal",
      pattern: "staggered",
      staggerAxis: "x",
      maxNeckRatio: 0.4,
      minSplitBalanceRatio: 0.2,
    }) as unknown as JumperGraph

    const graphWithConnections = createProblemFromBaseGraph({
      baseGraph,
      numCrossings: 2,
      randomSeed: 0,
    })

    const solver = new JumperGraphSolver({
      inputGraph: {
        regions: graphWithConnections.regions,
        ports: graphWithConnections.ports,
      },
      inputConnections: graphWithConnections.connections,
    })

    solver.solve()

    expect(solver.solved).toBe(true)

    for (const region of graphWithConnections.regions) {
      if (!region.d.isThroughJumper) continue

      const networkIds = new Set(
        (region.assignments ?? []).map(
          (a) => a.connection.mutuallyConnectedNetworkId,
        ),
      )

      expect(networkIds.size).toBeLessThanOrEqual(1)
    }

    // TODO second issue: prevent non-through-jumper trace intersections
    // assertNoTraceIntersectionsOutsideThroughJumpers(
    //   solver.solvedRoutes,
    //   graphWithConnections.regions,
    // )

    expect(getSvgFromGraphicsObject(solver.visualize())).toMatchSvgSnapshot(
      import.meta.path,
    )
  },
)
