import type { Connection, HyperGraph, SerializedConnection } from "./types"

export const convertSerializedConnectionsToConnections = (
  inputConnections: (Connection | SerializedConnection)[],
  graph: HyperGraph,
): Connection[] => {
  const connections: Connection[] = []
  for (const inputConn of inputConnections) {
    if ("startRegionId" in inputConn) {
      connections.push({
        connectionId: inputConn.connectionId,
        mutuallyConnectedNetworkId:
          inputConn.mutuallyConnectedNetworkId ?? inputConn.connectionId,
        startRegion: graph.regions.find(
          (region) => region.regionId === inputConn.startRegionId,
        )!,
        endRegion: graph.regions.find(
          (region) => region.regionId === inputConn.endRegionId,
        )!,
        startPortId: inputConn.startPortId,
        endPortId: inputConn.endPortId,
      })
    } else {
      connections.push(inputConn)
    }
  }
  return connections
}
