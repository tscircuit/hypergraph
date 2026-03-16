import type { SectionRoute } from "lib/HyperGraphSectionOptimizer/HyperGraphSectionOptimizer"
import type { Candidate, HyperGraph, Region, RegionPort } from "../../types"

const failSlice = (message: string): never => {
  throw new Error(`[sliceSolvedRouteIntoLocalSection] ${message}`)
}

const expectDefined = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) failSlice(message)
  return value as T
}

const getSharedRegion = (
  portA: RegionPort,
  portB: RegionPort,
  regionMap: Map<string, Region>,
): Region | undefined => {
  const aRegionIds = new Set([portA.region1.regionId, portA.region2.regionId])
  if (aRegionIds.has(portB.region1.regionId)) {
    return regionMap.get(portB.region1.regionId)
  }
  if (aRegionIds.has(portB.region2.regionId)) {
    return regionMap.get(portB.region2.regionId)
  }
  return undefined
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
    const port = expectDefined(
      portMap.get(originalCandidate.port.portId),
      `Missing section port ${originalCandidate.port.portId} for connection ${sectionRoute.sectionConnection.connectionId} at local index ${index}`,
    )

    const previousCandidate = index > 0 ? path[index - 1] : undefined
    const nextOriginalCandidate =
      index < originalLocalPath.length - 1
        ? originalLocalPath[index + 1]
        : undefined

    const lastRegion = previousCandidate
      ? getSharedRegion(previousCandidate.port, port, regionMap)
      : undefined

    if (previousCandidate && !lastRegion) {
      failSlice(
        `Non-adjacent local transition for connection ${sectionRoute.sectionConnection.connectionId} at local index ${index}: ${previousCandidate.port.portId} -> ${port.portId}`,
      )
    }

    const nextPort = nextOriginalCandidate
      ? portMap.get(nextOriginalCandidate.port.portId)
      : undefined
    if (nextOriginalCandidate) {
      expectDefined(
        nextPort,
        `Missing next section port ${nextOriginalCandidate.port.portId} for connection ${sectionRoute.sectionConnection.connectionId} at local index ${index + 1}`,
      )
    }

    const nextRegion = nextPort
      ? getSharedRegion(port, nextPort, regionMap)
      : sectionRoute.sectionConnection.endRegion

    if (nextPort && !nextRegion) {
      failSlice(
        `Cannot infer nextRegion for connection ${sectionRoute.sectionConnection.connectionId} between ${port.portId} and ${nextPort.portId}`,
      )
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
