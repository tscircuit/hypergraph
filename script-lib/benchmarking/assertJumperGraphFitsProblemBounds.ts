import { calculateGraphBounds } from "../../lib/JumperGraphSolver/jumper-graph-generator/calculateGraphBounds"
import type { JumperGraph } from "../../lib/JumperGraphSolver/jumper-types"
import { getBoundsHeight } from "./getBoundsHeight"
import { getBoundsWidth } from "./getBoundsWidth"
import type { Bounds } from "./jumperSolverBenchmarkTypes"

export const assertJumperGraphFitsProblemBounds = (
  graphName: string,
  graph: JumperGraph,
  problemBounds: Bounds,
): void => {
  const graphBounds = calculateGraphBounds(graph.regions)
  const graphWidth = getBoundsWidth(graphBounds)
  const graphHeight = getBoundsHeight(graphBounds)
  const problemWidth = getBoundsWidth(problemBounds)
  const problemHeight = getBoundsHeight(problemBounds)
  const epsilon = 1e-6

  if (
    graphWidth > problemWidth + epsilon ||
    graphHeight > problemHeight + epsilon
  ) {
    throw new Error(
      `Graph "${graphName}" exceeds problem bounds: graph=${graphWidth.toFixed(3)}x${graphHeight.toFixed(3)}, problem=${problemWidth.toFixed(3)}x${problemHeight.toFixed(3)}`,
    )
  }
}
