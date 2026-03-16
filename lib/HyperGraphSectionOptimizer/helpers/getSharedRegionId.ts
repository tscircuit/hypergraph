import type { RegionPort } from "lib/types"

/**
 * Returns the regionId that two ports share, or null if they don't share one.
 * Used to determine which region a route passes through when transitioning between two adjacent ports.
 */
export const getSharedRegionId = (
  portA: RegionPort,
  portB: RegionPort,
): string | null => {
  const portARegionIds = new Set([
    portA.region1.regionId,
    portA.region2.regionId,
  ])
  if (portARegionIds.has(portB.region1.regionId)) {
    return portB.region1.regionId
  }
  if (portARegionIds.has(portB.region2.regionId)) {
    return portB.region2.regionId
  }
  return null
}
