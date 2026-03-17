import { getSectionOfHyperGraphAsHyperGraph } from "./HyperGraphSectionOptimizer/sections/getSectionOfHyperGraphAsHyperGraph"
import { convertConnectionsToSerializedConnections } from "./convertConnectionsToSerializedConnections"
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
    connections: convertConnectionsToSerializedConnections(section.connections),
    solvedRoutes: convertSolvedRoutesToSerializedSolvedRoutes(
      section.sectionRoutes.map((route) => route.sectionRoute),
    ),
    _sectionCentralRegionId: section.centralRegionId,
    _sectionRouteBindings: section.sectionRoutes.map((route) => ({
      connectionId: route.globalConnection.connectionId,
      solvedPathStartIndex: route.sectionStartIndex,
      solvedPathEndIndex: route.sectionEndIndex,
    })),
  }
}
