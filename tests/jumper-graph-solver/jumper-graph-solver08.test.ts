import { expect, test } from "bun:test"
import { generate0603JumperHyperGraph } from "@tscircuit/jumper-topology-generator"
import type { GraphicsObject } from "graphics-debug"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"
import { createProblemFromBaseGraph } from "lib/JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"
import type { JRegion, JumperGraph } from "lib/JumperGraphSolver/jumper-types"
import { getTraceIntersectionsOutsideThroughJumpers } from "./assertNoTraceIntersectionsOutsideThroughJumpers"

test(
  "jumper-graph-solver08: no non-through-jumper intersections in 4x3 staggered grid",
  // @ts-expect-error bun:test types don't include timeout option
  { timeout: 30000 },
  () => {
    const baseGraph = generate0603JumperHyperGraph({
      rows: 4,
      cols: 3,
      orientation: "horizontal",
      pattern: "staggered",
      staggerAxis: "x",
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

    const violations = getTraceIntersectionsOutsideThroughJumpers(
      solver.solvedRoutes,
      graphWithConnections.regions,
    )

    expect(violations.length).toBe(0)

    const labelByRegionId = getNonPadNonThroughJumperRegionLabels(
      graphWithConnections.regions,
    )

    const visualization = solver.visualize() as Required<GraphicsObject>

    for (const region of graphWithConnections.regions) {
      const label = labelByRegionId.get(region.regionId)
      if (!label) continue

      const bounds = region.d.bounds
      const centerX = (bounds.minX + bounds.maxX) / 2
      const centerY = (bounds.minY + bounds.maxY) / 2

      visualization.points.push({
        x: centerX,
        y: centerY,
        color: "rgba(0, 0, 0, 1)",
        label,
      })
    }

    for (const [index, violation] of violations.entries()) {
      visualization.points.push({
        x: violation.point.x,
        y: violation.point.y,
        color: "rgba(255, 0, 0, 1)",
        label: `X${index + 1}: ${violation.regionLabel}`,
      })
    }

    expect(getSvgFromGraphicsObject(visualization)).toMatchSvgSnapshot(
      import.meta.path,
    )
  },
)

const getNonPadNonThroughJumperRegionLabels = (
  regions: JRegion[],
): Map<string, string> => {
  return new Map(
    regions
      .filter((region) => !region.d.isPad && !region.d.isThroughJumper)
      .map((region, index) => [
        region.regionId,
        `R${index + 1}: ${region.regionId}`,
      ]),
  )
}
