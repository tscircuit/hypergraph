import { attachSerializedGraphMetadata } from "./serializedGraphMetadata"
import type { PortId, SerializedGraphPort, SerializedHyperGraph } from "./types"

export const markDeadEndPortsInSerializedGraph = (
  graph: SerializedHyperGraph,
  retainedPortIds: Iterable<PortId> = [],
): SerializedHyperGraph => {
  const graphWithMetadata = attachSerializedGraphMetadata(graph)
  const retainedPortIdSet = new Set(retainedPortIds)

  return attachSerializedGraphMetadata({
    ...graphWithMetadata,
    ports: graphWithMetadata.ports.map((port) =>
      markSerializedPortDeadEndState({
        port,
        retainedPortIdSet,
        graph: graphWithMetadata,
      }),
    ),
  })
}

const markSerializedPortDeadEndState = (input: {
  port: SerializedGraphPort
  retainedPortIdSet: Set<PortId>
  graph: SerializedHyperGraph
}): SerializedGraphPort => {
  const { port, retainedPortIdSet, graph } = input
  const region1PortCount =
    graph._portsByRegionId?.get(port.region1Id)?.length ?? 0
  const region2PortCount =
    graph._portsByRegionId?.get(port.region2Id)?.length ?? 0
  const isDeadEndPort = region1PortCount === 1 || region2PortCount === 1
  const nextD =
    port.d && typeof port.d === "object"
      ? Array.isArray(port.d)
        ? [...port.d]
        : { ...port.d }
      : {}

  if (isDeadEndPort && !retainedPortIdSet.has(port.portId)) {
    nextD.deadEnd = true
  } else if ("deadEnd" in nextD) {
    delete nextD.deadEnd
  }

  return {
    ...port,
    d: nextD,
  }
}
