import type {
  HyperGraph,
  SerializedHyperGraph,
  SerializedGraphPort,
  SerializedGraphRegion,
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
    }),
  )

  return {
    ports: serializedPorts,
    regions: serializedRegions,
  }
}
