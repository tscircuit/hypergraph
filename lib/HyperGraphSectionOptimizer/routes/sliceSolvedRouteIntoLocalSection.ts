import type { SectionRoute } from "lib/HyperGraphSectionOptimizer/HyperGraphSectionOptimizer"
import type { Candidate, HyperGraph, Region, RegionPort } from "lib/types"
import { getSharedRegionId } from "lib/HyperGraphSectionOptimizer/helpers/getSharedRegionId"

const getSharedRegion = (
  portA: RegionPort,
  portB: RegionPort,
  regionMap: Map<string, Region>,
): Region | undefined => {
  const sharedRegionId = getSharedRegionId(portA, portB)
  return sharedRegionId ? regionMap.get(sharedRegionId) : undefined
}

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
  const portMap = new Map(graph.ports.map((port) => [port.portId, port]))
  const regionMap = new Map(
    graph.regions.map((region) => [region.regionId, region]),
  )
  const originalLocalPath = sectionRoute.globalRoute.path.slice(
    sectionRoute.sectionStartIndex,
    sectionRoute.sectionEndIndex + 1,
  )

  const path: Candidate[] = []

  for (let index = 0; index < originalLocalPath.length; index++) {
    const originalCandidate = originalLocalPath[index]
    const port = portMap.get(originalCandidate.port.portId)
    if (!port) {
      throw new Error(`Missing section port ${originalCandidate.port.portId}`)
    }

    const previousCandidate = index > 0 ? path[index - 1] : undefined
    const nextOriginalCandidate =
      index < originalLocalPath.length - 1
        ? originalLocalPath[index + 1]
        : undefined

    const lastRegion = previousCandidate
      ? getSharedRegion(previousCandidate.port, port, regionMap)
      : undefined

    if (previousCandidate && !lastRegion) {
      throw new Error(`Non-adjacent local transition at index ${index}`)
    }

    const nextPort = nextOriginalCandidate
      ? portMap.get(nextOriginalCandidate.port.portId)
      : undefined
    if (nextOriginalCandidate && !nextPort) {
      throw new Error(`Missing next section port at index ${index + 1}`)
    }

    const nextRegion = nextPort
      ? getSharedRegion(port, nextPort, regionMap)
      : sectionRoute.sectionConnection.endRegion

    if (nextPort && !nextRegion) {
      throw new Error(`Cannot infer nextRegion at index ${index}`)
    }

    path.push({
      port,
      g: originalCandidate.g,
      h: originalCandidate.h,
      f: originalCandidate.f,
      hops: index,
      ripRequired: originalCandidate.ripRequired,
      parent: previousCandidate,
      lastPort: previousCandidate?.port,
      lastRegion,
      nextRegion,
    })
  }

  return {
    connection: sectionRoute.sectionConnection,
    path,
    requiredRip: sectionRoute.globalRoute.requiredRip,
  }
}
