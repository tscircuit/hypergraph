import type { HyperGraph } from "../types"
import type { JumperGraph, JRegion } from "./jumper-types"

export const prepareJumperGraphForSolver = <
  TGraph extends HyperGraph = HyperGraph,
>(
  graph: TGraph,
): JumperGraph => {
  for (const region of graph.regions) {
    const regionData = (region.d ?? {}) as JRegion["d"] & {
      width?: number
      height?: number
    }

    if (!regionData.bounds && regionData.center) {
      const width = regionData.width ?? 0
      const height = regionData.height ?? 0
      regionData.bounds = {
        minX: regionData.center.x - width / 2,
        maxX: regionData.center.x + width / 2,
        minY: regionData.center.y - height / 2,
        maxY: regionData.center.y + height / 2,
      }
    }

    if (!regionData.center && regionData.bounds) {
      regionData.center = {
        x: (regionData.bounds.minX + regionData.bounds.maxX) / 2,
        y: (regionData.bounds.minY + regionData.bounds.maxY) / 2,
      }
    }

    if (!regionData.bounds) {
      throw new Error(
        `Region ${region.regionId} is missing bounds and cannot be prepared for JumperGraphSolver`,
      )
    }

    regionData.isPad = Boolean(regionData.isPad)
    region.d = regionData
  }

  return graph as unknown as JumperGraph
}
