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

    port.d =
      port.d && typeof port.d === "object"
        ? Array.isArray(port.d)
          ? [...port.d]
          : { ...port.d }
        : {}

    if (isDeadEndPort && !retainedPortIdSet.has(port.portId)) {
      port.d.deadEnd = true
    } else if ("deadEnd" in port.d) {
      delete port.d.deadEnd
    }
  }

  return graph
}

export const isMarkedDeadEndPort = (port: RegionPort): boolean =>
  Boolean(port.d?.deadEnd)
