import type {
  HyperGraph,
  SerializedGraphPort,
  SerializedGraphRegion,
  SerializedHyperGraph,
} from "./types"

export const convertHyperGraphToSerializedHyperGraph = (
  graph: HyperGraph,
): SerializedHyperGraph => {
  const serializedPorts: SerializedGraphPort[] = graph.ports.map((port) => ({
    portId: port.portId,
    region1Id: port.region1.regionId,
    region2Id: port.region2.regionId,
    d: port.d,
  }))

  const serializedRegions: SerializedGraphRegion[] = graph.regions.map(
    (region) => ({
      regionId: region.regionId,
      pointIds: region.ports.map((port) => port.portId),
      d: region.d,
      assignments: (region.assignments ?? [])
        .filter((assignment) => assignment.isFixed)
        .map((assignment) => ({
          regionPort1Id: assignment.regionPort1.portId,
          regionPort2Id: assignment.regionPort2.portId,
          connectionId: assignment.connection.connectionId,
        })),
    }),
  )

  return {
    ports: serializedPorts,
    regions: serializedRegions,
  }
}
