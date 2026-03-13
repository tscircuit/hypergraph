import type { SectionRoute } from "lib/HyperGraphSectionOptimizer/HyperGraphSectionOptimizer"
import type { Candidate, HyperGraph } from "../../types"

/** Extracts the segment of the original route confined to the section graph. */
export const sliceSolvedRouteIntoLocalSection = (input: {
  sectionRoute: Pick<
    SectionRoute,
    | "globalRoute"
    | "sectionConnection"
    | "sectionStartIndex"
    | "sectionEndIndex"
  >
  graph: HyperGraph
}): SectionRoute["sectionRoute"] => {
  const { sectionRoute, graph } = input
  const localPortIds = new Set(graph.ports.map((port) => port.portId))
  const originalLocalPath = sectionRoute.globalRoute.path
    .slice(sectionRoute.sectionStartIndex, sectionRoute.sectionEndIndex + 1)
    .filter((candidate) => localPortIds.has(candidate.port.portId))

  const path: Candidate[] = []
  let currentRegion = sectionRoute.sectionConnection.startRegion

  for (let index = 0; index < originalLocalPath.length; index++) {
    const originalCandidate = originalLocalPath[index]
    const port = graph.ports.find(
      (candidatePort) => candidatePort.portId === originalCandidate.port.portId,
    )!
    const nextRegion =
      port.region1 === currentRegion ? port.region2 : port.region1

    path.push({
      port,
      g: originalCandidate.g,
      h: originalCandidate.h,
      f: originalCandidate.f,
      hops: index,
      ripRequired: originalCandidate.ripRequired,
      parent: index > 0 ? path[index - 1] : undefined,
      lastPort: index > 0 ? path[index - 1].port : undefined,
      lastRegion: index > 0 ? currentRegion : undefined,
      nextRegion,
    })

    currentRegion = nextRegion
  }

  return {
    connection: sectionRoute.sectionConnection,
    path,
    requiredRip: sectionRoute.globalRoute.requiredRip,
  }
}
