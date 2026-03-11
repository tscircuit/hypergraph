import type {
  Candidate,
  Connection,
  HyperGraph,
  Region,
  RegionPort,
  SerializedSolvedRoute,
  SerializedSolvedRouteCandidate,
  SolvedRoute,
} from "./types"

const getConnectionMap = (connections: Connection[]) =>
  new Map(connections.map((connection) => [connection.connectionId, connection]))

const getPortMap = (graph: HyperGraph) =>
  new Map(graph.ports.map((port) => [port.portId, port]))

const getRegionMap = (graph: HyperGraph) =>
  new Map(graph.regions.map((region) => [region.regionId, region]))

const requireValue = <T>(value: T | undefined, label: string): T => {
  if (value === undefined) {
    throw new Error(`Missing ${label} while hydrating solvedRoutes`)
  }
  return value
}

export const serializeSolvedRoutes = (
  solvedRoutes: SolvedRoute[],
): SerializedSolvedRoute[] =>
  solvedRoutes.map((solvedRoute) => ({
    connectionId: solvedRoute.connection.connectionId,
    requiredRip: solvedRoute.requiredRip,
    locked: solvedRoute.locked,
    path: solvedRoute.path.map(
      (candidate): SerializedSolvedRouteCandidate => ({
        portId: candidate.port.portId,
        g: candidate.g,
        h: candidate.h,
        f: candidate.f,
        hops: candidate.hops,
        ripRequired: candidate.ripRequired,
        lastPortId: candidate.lastPort?.portId,
        lastRegionId: candidate.lastRegion?.regionId,
        nextRegionId: candidate.nextRegion?.regionId,
      }),
    ),
  }))

export const hydrateSolvedRoutes = (
  solvedRoutes: SerializedSolvedRoute[],
  graph: HyperGraph,
  connections: Connection[],
): SolvedRoute[] => {
  const connectionMap = getConnectionMap(connections)
  const portMap = getPortMap(graph)
  const regionMap = getRegionMap(graph)

  return solvedRoutes.map((serializedSolvedRoute) => {
    const path: Candidate[] = []

    for (const serializedCandidate of serializedSolvedRoute.path) {
      const candidate: Candidate = {
        port: requireValue(
          portMap.get(serializedCandidate.portId),
          `port ${serializedCandidate.portId}`,
        ),
        g: serializedCandidate.g,
        h: serializedCandidate.h,
        f: serializedCandidate.f,
        hops: serializedCandidate.hops,
        ripRequired: serializedCandidate.ripRequired,
        parent: path[path.length - 1],
        lastPort: serializedCandidate.lastPortId
          ? requireValue(
              portMap.get(serializedCandidate.lastPortId),
              `port ${serializedCandidate.lastPortId}`,
            )
          : undefined,
        lastRegion: serializedCandidate.lastRegionId
          ? requireValue(
              regionMap.get(serializedCandidate.lastRegionId),
              `region ${serializedCandidate.lastRegionId}`,
            )
          : undefined,
        nextRegion: serializedCandidate.nextRegionId
          ? requireValue(
              regionMap.get(serializedCandidate.nextRegionId),
              `region ${serializedCandidate.nextRegionId}`,
            )
          : undefined,
      }
      path.push(candidate)
    }

    return {
      path,
      connection: requireValue(
        connectionMap.get(serializedSolvedRoute.connectionId),
        `connection ${serializedSolvedRoute.connectionId}`,
      ),
      requiredRip: serializedSolvedRoute.requiredRip,
      locked: serializedSolvedRoute.locked ?? false,
    }
  })
}
