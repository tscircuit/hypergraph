import type { Connection, SerializedConnection } from "./types"

export const convertConnectionsToSerializedConnections = (
  connections: Connection[],
): SerializedConnection[] => {
  return connections.map((conn) => {
    const serializedConn: SerializedConnection = {
      connectionId: conn.connectionId,
      startRegionId: conn.startRegion.regionId,
      endRegionId: conn.endRegion.regionId,
      mutuallyConnectedNetworkId: conn.mutuallyConnectedNetworkId,
    }

    if (conn.startPortId) serializedConn.startPortId = conn.startPortId
    if (conn.endPortId) serializedConn.endPortId = conn.endPortId

    return serializedConn
  })
}
