import { generate0603JumperHyperGraph } from "@tscircuit/jumper-topology-generator"
import type { JumperGraph } from "../../lib/JumperGraphSolver/jumper-types"
import { getBoundsHeight } from "./getBoundsHeight"
import { getBoundsWidth } from "./getBoundsWidth"
import { jumperGraphFitsBounds } from "./jumperGraphFitsBounds"
import type {
  Bounds,
  JumperTopologyCandidate,
} from "./jumperSolverBenchmarkTypes"
import { sortJumperTopologyCandidatesByAreaDesc } from "./sortJumperTopologyCandidatesByAreaDesc"

type Generate0603FilledAndStaggeredTopologyCandidatesOptions = {
  maxRows?: number
  maxCols?: number
  maxCandidatesPerSample?: number
}

export const generate0603FilledAndStaggeredTopologyCandidates = (
  bounds: Bounds,
  {
    maxRows = 8,
    maxCols = 8,
    maxCandidatesPerSample = 18,
  }: Generate0603FilledAndStaggeredTopologyCandidatesOptions = {},
): JumperTopologyCandidate[] => {
  const problemWidth = getBoundsWidth(bounds)
  const problemHeight = getBoundsHeight(bounds)

  const candidates: JumperTopologyCandidate[] = []

  for (let rows = 1; rows <= maxRows; rows++) {
    for (let cols = 1; cols <= maxCols; cols++) {
      for (const orientation of ["vertical", "horizontal"] as const) {
        const filledGraph = generate0603JumperHyperGraph({
          rows,
          cols,
          orientation,
          pattern: "grid",
        }) as unknown as JumperGraph

        if (!jumperGraphFitsBounds(filledGraph, problemWidth, problemHeight)) {
          continue
        }

        candidates.push({
          name: `0603-filled-${rows}x${cols}-${orientation}`,
          graph: filledGraph,
        })

        const staggeredXGraph = generate0603JumperHyperGraph({
          rows,
          cols,
          orientation,
          pattern: "staggered",
          staggerAxis: "x",
        }) as unknown as JumperGraph
        if (
          jumperGraphFitsBounds(staggeredXGraph, problemWidth, problemHeight)
        ) {
          candidates.push({
            name: `0603-staggered-x-${rows}x${cols}-${orientation}`,
            graph: staggeredXGraph,
          })
        }

        const staggeredYGraph = generate0603JumperHyperGraph({
          rows,
          cols,
          orientation,
          pattern: "staggered",
          staggerAxis: "y",
        }) as unknown as JumperGraph
        if (
          jumperGraphFitsBounds(staggeredYGraph, problemWidth, problemHeight)
        ) {
          candidates.push({
            name: `0603-staggered-y-${rows}x${cols}-${orientation}`,
            graph: staggeredYGraph,
          })
        }
      }
    }
  }

  return sortJumperTopologyCandidatesByAreaDesc(candidates).slice(
    0,
    maxCandidatesPerSample,
  )
}
