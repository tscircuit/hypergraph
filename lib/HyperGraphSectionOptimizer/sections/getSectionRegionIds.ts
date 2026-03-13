import type { HyperGraph, Region, RegionId } from "lib/types"

/** Computes the region IDs that fall within the requested expansion radius. */
export const getSectionRegionIds = ({
  centralRegion,
  expansionHopsFromCentralRegion,
}: {
  graph: HyperGraph
  centralRegion: Region
  expansionHopsFromCentralRegion: number
}): Set<RegionId> => {
  const sectionRegionIds = new Set<RegionId>([centralRegion.regionId])
  const queue: Array<{ region: Region; hops: number }> = [
    { region: centralRegion, hops: 0 },
  ]

  while (queue.length > 0) {
    const { region, hops } = queue.shift()!
    if (hops >= expansionHopsFromCentralRegion + 1) continue

    for (const port of region.ports) {
      const nextRegion = port.region1 === region ? port.region2 : port.region1
      if (sectionRegionIds.has(nextRegion.regionId)) continue
      sectionRegionIds.add(nextRegion.regionId)
      queue.push({ region: nextRegion, hops: hops + 1 })
    }
  }

  return sectionRegionIds
}
