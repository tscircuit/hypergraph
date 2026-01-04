import type {
  GraphEdge,
  GraphEdgeId,
  RegionPort,
  PortId,
  Region,
  RegionId,
  HyperGraph,
  SerializedHyperGraph,
} from "./types"

export const convertSerializedHyperGraphToHyperGraph = (
  serializedHyperGraph: SerializedHyperGraph | HyperGraph,
): HyperGraph => {
  const edgeMap = new Map<GraphEdgeId, GraphEdge>()
  const pointMap = new Map<PortId, RegionPort>()
  const regionMap = new Map<RegionId, Region>()

  for (const edge of serializedHyperGraph.edges) {
    edgeMap.set(edge.edgeId, { ...edge })
  }

  for (const point of serializedHyperGraph.ports) {
    if ("edges" in point) {
      pointMap.set(point.portId, {
        ...point,
        edges: point.edges,
      })
    } else {
      pointMap.set(point.portId, {
        ...point,
        edges: point.edgeIds.map((edgeId) => edgeMap.get(edgeId)!),
      })
    }
  }

  for (const region of serializedHyperGraph.regions) {
    if ("points" in region) {
      regionMap.set(region.regionId, {
        ...region,
        ports: region.ports,
      })
    } else {
      regionMap.set(region.regionId, {
        ...region,
        ports: region.pointIds.map((pointId) => pointMap.get(pointId)!),
      })
    }
  }

  return {
    edges: Array.from(edgeMap.values()),
    ports: Array.from(pointMap.values()),
    regions: Array.from(regionMap.values()),
  }
}
