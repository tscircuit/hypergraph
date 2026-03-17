import { getSectionOfHyperGraphAsHyperGraph } from "./HyperGraphSectionOptimizer/sections/getSectionOfHyperGraphAsHyperGraph"
import { convertHyperGraphToSerializedHyperGraph } from "./convertHyperGraphToSerializedHyperGraph"
import { convertSerializedHyperGraphToHyperGraph } from "./convertSerializedHyperGraphToHyperGraph"
import { convertSerializedSolvedRoutesToSolvedRoutes } from "./convertSerializedSolvedRoutesToSolvedRoutes"
import { convertSolvedRoutesToSerializedSolvedRoutes } from "./convertSolvedRoutesToSerializedSolvedRoutes"
import type { RegionId, SerializedHyperGraph } from "./types"

export const extractSectionOfHyperGraph = (input: {
  graph: SerializedHyperGraph
  centralRegionId: RegionId
  expansionHopsFromCentralRegion: number
}): SerializedHyperGraph => {
  const deserializedGraph = convertSerializedHyperGraphToHyperGraph(input.graph)
  const centralRegion = deserializedGraph.regions.find(
    (region) => region.regionId === input.centralRegionId,
  )

  if (!centralRegion) {
    throw new Error(
      `Central region ${input.centralRegionId} not found in hypergraph`,
    )
  }

  if (!input.graph.solvedRoutes) {
    throw new Error(
      "extractSectionOfHyperGraph requires graph.solvedRoutes to be present",
    )
  }

  const solvedRoutes = convertSerializedSolvedRoutesToSolvedRoutes(
    input.graph.solvedRoutes,
    deserializedGraph,
  )

  const section = getSectionOfHyperGraphAsHyperGraph({
    graph: deserializedGraph,
    solvedRoutes,
    centralRegion,
    expansionHopsFromCentralRegion: input.expansionHopsFromCentralRegion,
  })

  return {
    ...convertHyperGraphToSerializedHyperGraph(section.graph),
    solvedRoutes: convertSolvedRoutesToSerializedSolvedRoutes(
      section.sectionRoutes.map((route) => route.sectionRoute),
    ),
  }
}
