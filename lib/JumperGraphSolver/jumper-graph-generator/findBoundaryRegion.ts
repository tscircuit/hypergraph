import type { JRegion } from "../jumper-types"
import type { Bounds } from "../Bounds"

export type BoundaryRegionResult = {
  region: JRegion
  portPosition: { x: number; y: number }
}

export const findBoundaryRegion = (
  x: number,
  y: number,
  regions: JRegion[],
  graphBounds: Bounds,
): BoundaryRegionResult | null => {
  // Find frame regions (non-pad, non-throughjumper regions at the boundary)
  for (const region of regions) {
    if (region.d.isPad || region.d.isThroughJumper) continue

    const bounds = region.d.bounds

    // Check if point is on or near the boundary of this region
    // Point is adjacent if it's outside the graph bounds and aligns with this region

    // Check left boundary
    if (
      Math.abs(x - bounds.minX) < 0.01 &&
      y >= bounds.minY &&
      y <= bounds.maxY
    ) {
      return { region, portPosition: { x: bounds.minX, y } }
    }

    // Check right boundary
    if (
      Math.abs(x - bounds.maxX) < 0.01 &&
      y >= bounds.minY &&
      y <= bounds.maxY
    ) {
      return { region, portPosition: { x: bounds.maxX, y } }
    }

    // Check bottom boundary
    if (
      Math.abs(y - bounds.minY) < 0.01 &&
      x >= bounds.minX &&
      x <= bounds.maxX
    ) {
      return { region, portPosition: { x, y: bounds.minY } }
    }

    // Check top boundary
    if (
      Math.abs(y - bounds.maxY) < 0.01 &&
      x >= bounds.minX &&
      x <= bounds.maxX
    ) {
      return { region, portPosition: { x, y: bounds.maxY } }
    }
  }

  // If no exact match, find the closest frame region
  let closestRegion: JRegion | null = null
  let closestDistance = Number.POSITIVE_INFINITY
  let closestPortPosition = { x, y }

  for (const region of regions) {
    if (region.d.isPad || region.d.isThroughJumper) continue

    const bounds = region.d.bounds

    // Only consider frame regions (regions at the outer edge of the graph)
    const isOuterRegion =
      Math.abs(bounds.minX - graphBounds.minX) < 0.01 ||
      Math.abs(bounds.maxX - graphBounds.maxX) < 0.01 ||
      Math.abs(bounds.minY - graphBounds.minY) < 0.01 ||
      Math.abs(bounds.maxY - graphBounds.maxY) < 0.01

    if (!isOuterRegion) continue

    // Calculate distance to this region's boundary
    const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, x))
    const clampedY = Math.max(bounds.minY, Math.min(bounds.maxY, y))
    const dist = Math.sqrt((x - clampedX) ** 2 + (y - clampedY) ** 2)

    if (dist < closestDistance) {
      closestDistance = dist
      closestRegion = region

      // Determine port position on the boundary
      if (x < bounds.minX) {
        closestPortPosition = { x: bounds.minX, y: clampedY }
      } else if (x > bounds.maxX) {
        closestPortPosition = { x: bounds.maxX, y: clampedY }
      } else if (y < bounds.minY) {
        closestPortPosition = { x: clampedX, y: bounds.minY }
      } else if (y > bounds.maxY) {
        closestPortPosition = { x: clampedX, y: bounds.maxY }
      } else {
        closestPortPosition = { x: clampedX, y: clampedY }
      }
    }
  }

  if (closestRegion) {
    return { region: closestRegion, portPosition: closestPortPosition }
  }

  return null
}
