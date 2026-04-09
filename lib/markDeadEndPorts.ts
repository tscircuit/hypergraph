import type { HyperGraph, PortId, RegionPort } from "./types"

export const markDeadEndPorts = (
  graph: HyperGraph,
  retainedPortIds: Iterable<PortId> = [],
): HyperGraph => {
  const retainedPortIdSet = new Set(retainedPortIds)
  const regionPortCounts = new Map(
    graph.regions.map((region) => [region.regionId, region.ports.length]),
  )

  for (const port of graph.ports) {
    const isDeadEndPort =
      regionPortCounts.get(port.region1.regionId) === 1 ||
      regionPortCounts.get(port.region2.regionId) === 1

    if (isDeadEndPort && !retainedPortIdSet.has(port.portId)) {
      port._deadendInSection = true
    } else if ("_deadendInSection" in port) {
      delete port._deadendInSection
    }
  }

  return graph
}

export const isMarkedDeadEndPort = (port: RegionPort): boolean =>
  Boolean(port._deadendInSection)
