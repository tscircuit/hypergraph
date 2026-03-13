import type { HyperGraphSectionRouteDescriptor } from "lib/HyperGraphSectionOptimizer/HyperGraphSectionOptimizer"
import type { Candidate, HyperGraph } from "../../types"

/** Extracts the segment of the original route confined to the section graph. */
export const sliceSolvedRouteIntoLocalSection = (input: {
  descriptor: Pick<
    HyperGraphSectionRouteDescriptor,
    "originalRoute" | "localConnection" | "startIndex" | "endIndex"
  >
  graph: HyperGraph
}): HyperGraphSectionRouteDescriptor["localSolvedRoute"] => {
  const { descriptor, graph } = input
  const localPortIds = new Set(graph.ports.map((port) => port.portId))
  const originalLocalPath = descriptor.originalRoute.path
    .slice(descriptor.startIndex, descriptor.endIndex + 1)
    .filter((candidate) => localPortIds.has(candidate.port.portId))

  const path: Candidate[] = []
  let currentRegion = descriptor.localConnection.startRegion

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
    connection: descriptor.localConnection,
    path,
    requiredRip: descriptor.originalRoute.requiredRip,
  }
}
