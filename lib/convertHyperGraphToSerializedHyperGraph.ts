import type {
  HyperGraph,
  SerializedHyperGraph,
  SerializedGraphPort,
  SerializedGraphRegion,
  SolvedRoute,
} from "./types"
import { attachSerializedGraphMetadata } from "./serializedGraphMetadata"

export const convertHyperGraphToSerializedHyperGraph = (
  graph: HyperGraph,
): SerializedHyperGraph => {
  const serializedPorts: SerializedGraphPort[] = graph.ports.map((port) => ({
    portId: port.portId,
    region1Id: port.region1.regionId,
    region2Id: port.region2.regionId,
    d: port.d,
    _deadendInSection: port._deadendInSection,
  }))

  const serializedRegions: SerializedGraphRegion[] = graph.regions.map(
    (region) => ({
      regionId: region.regionId,
      pointIds: region.ports.map((port) => port.portId),
      d: region.d,
    }),
  )

  return attachSerializedGraphMetadata({
    ports: serializedPorts,
    regions: serializedRegions,
  })
}
