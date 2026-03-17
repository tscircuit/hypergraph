import { convertConnectionsToSerializedConnections } from "./convertConnectionsToSerializedConnections"
import type { SerializedSolvedRoute, SolvedRoute } from "./types"

export const convertSolvedRoutesToSerializedSolvedRoutes = (
  solvedRoutes: SolvedRoute[],
): SerializedSolvedRoute[] => {
  return solvedRoutes.map((solvedRoute) => ({
    path: solvedRoute.path.map((candidate) => ({
      portId: candidate.port.portId,
      g: candidate.g,
      h: candidate.h,
      f: candidate.f,
      hops: candidate.hops,
      ripRequired: candidate.ripRequired,
      lastPortId: candidate.lastPort?.portId,
      lastRegionId: candidate.lastRegion?.regionId,
      nextRegionId: candidate.nextRegion?.regionId,
    })),
    connection: convertConnectionsToSerializedConnections([
      solvedRoute.connection,
    ])[0]!,
    requiredRip: solvedRoute.requiredRip,
  }))
}
