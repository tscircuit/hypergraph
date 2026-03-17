import { convertSerializedConnectionsToConnections } from "./convertSerializedConnectionsToConnections"
import type {
  Candidate,
  HyperGraph,
  Region,
  RegionId,
  RegionPort,
  SerializedSolvedRoute,
  SolvedRoute,
} from "./types"

export const convertSerializedSolvedRoutesToSolvedRoutes = (
  inputSolvedRoutes: SerializedSolvedRoute[],
  graph: HyperGraph,
): SolvedRoute[] => {
  const portMap = new Map(graph.ports.map((port) => [port.portId, port]))
  const regionMap = new Map(
    graph.regions.map((region) => [region.regionId, region]),
  )
  const connectionMap = new Map(
    convertSerializedConnectionsToConnections(
      inputSolvedRoutes.map((route) => route.connection),
      graph,
    ).map((connection) => [connection.connectionId, connection]),
  )

  return inputSolvedRoutes.map((inputSolvedRoute) => {
    const path: Candidate[] = []

    for (const originalCandidate of inputSolvedRoute.path) {
      const port = portMap.get(originalCandidate.portId)
      if (!port) {
        throw new Error(
          `Port ${originalCandidate.portId} not found while deserializing solved route ${inputSolvedRoute.connection.connectionId}`,
        )
      }

      const candidate: Candidate = {
        port,
        g: originalCandidate.g,
        h: originalCandidate.h,
        f: originalCandidate.f,
        hops: originalCandidate.hops,
        ripRequired: originalCandidate.ripRequired,
      }

      if (originalCandidate.lastPortId) {
        candidate.lastPort = getRequiredPort(
          portMap,
          originalCandidate.lastPortId,
          inputSolvedRoute.connection.connectionId,
        )
      }
      if (originalCandidate.lastRegionId) {
        candidate.lastRegion = getRequiredRegion(
          regionMap,
          originalCandidate.lastRegionId,
          inputSolvedRoute.connection.connectionId,
        )
      }
      if (originalCandidate.nextRegionId) {
        candidate.nextRegion = getRequiredRegion(
          regionMap,
          originalCandidate.nextRegionId,
          inputSolvedRoute.connection.connectionId,
        )
      }

      const parent = path[path.length - 1]
      if (parent) candidate.parent = parent
      path.push(candidate)
    }

    const connection = connectionMap.get(
      inputSolvedRoute.connection.connectionId,
    )
    if (!connection) {
      throw new Error(
        `Connection ${inputSolvedRoute.connection.connectionId} not found while deserializing solved route`,
      )
    }

    return {
      path,
      connection,
      requiredRip: inputSolvedRoute.requiredRip,
    }
  })
}

const getRequiredPort = (
  portMap: Map<string, RegionPort>,
  portId: string,
  connectionId: string,
): RegionPort => {
  const port = portMap.get(portId)
  if (!port) {
    throw new Error(
      `Port ${portId} not found while deserializing solved route ${connectionId}`,
    )
  }
  return port
}

const getRequiredRegion = (
  regionMap: Map<RegionId, Region>,
  regionId: RegionId,
  connectionId: string,
): Region => {
  const region = regionMap.get(regionId)
  if (!region) {
    throw new Error(
      `Region ${regionId} not found while deserializing solved route ${connectionId}`,
    )
  }
  return region
}
