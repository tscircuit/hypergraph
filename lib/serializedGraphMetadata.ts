import type {
  PortId,
  RegionId,
  SerializedGraphPort,
  SerializedGraphRegion,
  SerializedHyperGraph,
} from "./types"

type SerializedGraphMetadata = {
  portMap: Map<PortId, SerializedGraphPort>
  regionMap: Map<RegionId, SerializedGraphRegion>
  portsByRegionId: Map<RegionId, SerializedGraphPort[]>
  adjacentRegionIdsByRegionId: Map<RegionId, Set<RegionId>>
}

export const attachSerializedGraphMetadata = (
  graph: SerializedHyperGraph,
): SerializedHyperGraph => {
  if (
    graph._portMap &&
    graph._regionMap &&
    graph._portsByRegionId &&
    graph._adjacentRegionIdsByRegionId
  ) {
    return graph
  }

  const metadata = createSerializedGraphMetadata(graph)
  Object.defineProperties(graph, {
    _portMap: {
      value: metadata.portMap,
      writable: true,
      configurable: true,
      enumerable: false,
    },
    _regionMap: {
      value: metadata.regionMap,
      writable: true,
      configurable: true,
      enumerable: false,
    },
    _portsByRegionId: {
      value: metadata.portsByRegionId,
      writable: true,
      configurable: true,
      enumerable: false,
    },
    _adjacentRegionIdsByRegionId: {
      value: metadata.adjacentRegionIdsByRegionId,
      writable: true,
      configurable: true,
      enumerable: false,
    },
  })

  return graph
}

const createSerializedGraphMetadata = (
  graph: SerializedHyperGraph,
): SerializedGraphMetadata => {
  const portMap = new Map<PortId, SerializedGraphPort>()
  const regionMap = new Map<RegionId, SerializedGraphRegion>()
  const portsByRegionId = new Map<RegionId, SerializedGraphPort[]>()
  const adjacentRegionIdsByRegionId = new Map<RegionId, Set<RegionId>>()

  for (const region of graph.regions) {
    regionMap.set(region.regionId, region)
    portsByRegionId.set(region.regionId, [])
    adjacentRegionIdsByRegionId.set(region.regionId, new Set())
  }

  for (const port of graph.ports) {
    portMap.set(port.portId, port)
    portsByRegionId.get(port.region1Id)?.push(port)
    portsByRegionId.get(port.region2Id)?.push(port)
    adjacentRegionIdsByRegionId.get(port.region1Id)?.add(port.region2Id)
    adjacentRegionIdsByRegionId.get(port.region2Id)?.add(port.region1Id)
  }

  return {
    portMap,
    regionMap,
    portsByRegionId,
    adjacentRegionIdsByRegionId,
  }
}
