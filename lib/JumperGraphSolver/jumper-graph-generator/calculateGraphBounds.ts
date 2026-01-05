import type { JRegion } from "../jumper-types"
import type { Bounds } from "../Bounds"

export const calculateGraphBounds = (regions: JRegion[]): Bounds => {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const region of regions) {
    const { bounds } = region.d
    minX = Math.min(minX, bounds.minX)
    maxX = Math.max(maxX, bounds.maxX)
    minY = Math.min(minY, bounds.minY)
    maxY = Math.max(maxY, bounds.maxY)
  }

  return { minX, maxX, minY, maxY }
}
