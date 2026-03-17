import { getSectionOfHyperGraphAsHyperGraph } from "./HyperGraphSectionOptimizer/sections/getSectionOfHyperGraphAsHyperGraph"
import { convertHyperGraphToSerializedHyperGraph } from "./convertHyperGraphToSerializedHyperGraph"
import { convertSerializedHyperGraphToHyperGraph } from "./convertSerializedHyperGraphToHyperGraph"
import { convertSerializedSolvedRoutesToSolvedRoutes } from "./convertSerializedSolvedRoutesToSolvedRoutes"
import { convertSolvedRoutesToSerializedSolvedRoutes } from "./convertSolvedRoutesToSerializedSolvedRoutes"
import type { RegionId, SerializedHyperGraphWithSolvedRoutes } from "./types"

export const extractSectionOfHyperGraph = (input: {
  graph: SerializedHyperGraphWithSolvedRoutes
  centralRegionId: RegionId
  expansionHopsFromCentralRegion: number
}): SerializedHyperGraphWithSolvedRoutes => {
  const deserializedGraph = convertSerializedHyperGraphToHyperGraph(input.graph)
  const centralRegion = deserializedGraph.regions.find(
    (region) => region.regionId === input.centralRegionId,
  )

  if (!centralRegion) {
    throw new Error(
      `Central region ${input.centralRegionId} not found in hypergraph`,
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
