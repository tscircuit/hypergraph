import type { Connection, HyperGraph, SerializedConnection } from "./types"

export const convertSerializedConnectionsToConnections = (
  inputConnections: (Connection | SerializedConnection)[],
  graph: HyperGraph,
): Connection[] => {
  const connections: Connection[] = []
  for (const inputConn of inputConnections) {
    if ("startPointId" in inputConn) {
      connections.push({
        connectionId: inputConn.connectionId,
        startRegion: graph.ports.find(
          (point) => point.portId === inputConn.startPortId,
        )!,
        endPort: graph.ports.find(
          (point) => point.portId === inputConn.endPointId,
        )!,
      })
    } else {
      connections.push(inputConn)
    }
  }
  return connections
}
