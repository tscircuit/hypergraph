import type { HyperGraph, PortId, RegionPort } from "./types"

export const pruneDeadEndPorts = (
  graph: HyperGraph,
  retainedPortIds: Iterable<PortId> = [],
): HyperGraph => {
  const retainedPortIdSet = new Set(retainedPortIds)
  const regionPortCounts = new Map(
    graph.regions.map((region) => [region.regionId, region.ports.length]),
  )
  const nextPorts: RegionPort[] = []

  for (const region of graph.regions) {
    region.ports = []
  }

  for (const port of graph.ports) {
    const isDeadEndPort =
      regionPortCounts.get(port.region1.regionId) === 1 ||
      regionPortCounts.get(port.region2.regionId) === 1
    if (isDeadEndPort && !retainedPortIdSet.has(port.portId)) {
      continue
    }
    nextPorts.push(port)
    port.region1.ports.push(port)
    port.region2.ports.push(port)
  }

  graph.ports = nextPorts
  graph.regions = graph.regions.filter((region) => region.ports.length > 0)

  return graph
}
