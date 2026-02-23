import { calculateGraphBounds } from "../../lib/JumperGraphSolver/jumper-graph-generator/calculateGraphBounds"
import type { JumperGraph } from "../../lib/JumperGraphSolver/jumper-types"
import { getBoundsHeight } from "./getBoundsHeight"
import { getBoundsWidth } from "./getBoundsWidth"

export const jumperGraphFitsBounds = (
  graph: JumperGraph,
  maxWidth: number,
  maxHeight: number,
): boolean => {
  const graphBounds = calculateGraphBounds(graph.regions)
  const graphWidth = getBoundsWidth(graphBounds)
  const graphHeight = getBoundsHeight(graphBounds)
  return graphWidth <= maxWidth && graphHeight <= maxHeight
}
