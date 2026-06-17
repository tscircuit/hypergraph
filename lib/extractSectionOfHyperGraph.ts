import {
  compileGraphArena,
  compileSolveState,
  extractSectionView,
  materializeSerializedSectionGraph,
} from "./ArrayGraph"
import type { RegionId, SerializedHyperGraph } from "./types"

export const extractSectionOfHyperGraph = (input: {
  graph: SerializedHyperGraph
  centralRegionId: RegionId
  expansionHopsFromCentralRegion: number
}): SerializedHyperGraph => {
  if (!input.graph.solvedRoutes) {
    throw new Error(
      "extractSectionOfHyperGraph requires graph.solvedRoutes to be present",
    )
  }

  const arena = compileGraphArena(input.graph)
  const state = compileSolveState(input.graph, arena)
  const sectionView = extractSectionView({
    arena,
    state,
    centralRegionId: input.centralRegionId,
    expansionHopsFromCentralRegion: input.expansionHopsFromCentralRegion,
  })

  return materializeSerializedSectionGraph({
    arena,
    state,
    sectionView,
  })
}
