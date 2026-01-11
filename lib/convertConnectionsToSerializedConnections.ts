import type { Connection, SerializedConnection } from "./types"

export const convertConnectionsToSerializedConnections = (
  connections: Connection[],
): SerializedConnection[] => {
  return connections.map((conn) => ({
    connectionId: conn.connectionId,
    startRegionId: conn.startRegion.regionId,
    endRegionId: conn.endRegion.regionId,
  }))
}
