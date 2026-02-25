import { calculateGraphBounds } from "../../lib/JumperGraphSolver/jumper-graph-generator/calculateGraphBounds"
import { getBoundsHeight } from "./getBoundsHeight"
import { getBoundsWidth } from "./getBoundsWidth"
import type { JumperTopologyCandidate } from "./jumperSolverBenchmarkTypes"

export const sortJumperTopologyCandidatesByAreaDesc = (
  candidates: JumperTopologyCandidate[],
): JumperTopologyCandidate[] => {
  return candidates.toSorted((a, b) => {
    const aBounds = calculateGraphBounds(a.graph.regions)
    const bBounds = calculateGraphBounds(b.graph.regions)
    const aArea = getBoundsWidth(aBounds) * getBoundsHeight(aBounds)
    const bArea = getBoundsWidth(bBounds) * getBoundsHeight(bBounds)
    return bArea - aArea
  })
}
