import type { JRegion } from "../../JumperGraphSolver/jumper-types"

export type BoundaryRegionResult = {
  region: JRegion
  portPosition: { x: number; y: number }
}

/**
 * Returns the closest point on a polygon edge to the given point,
 * along with the distance.
 */
function closestPointOnPolygonEdge(
  point: { x: number; y: number },
  polygon: { x: number; y: number }[],
): { x: number; y: number; dist: number } {
  let bestDist = Infinity
  let bestPoint = { x: point.x, y: point.y }

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    if (lenSq < 1e-10) continue

    const t = Math.max(
      0,
      Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq),
    )
    const projX = a.x + t * dx
    const projY = a.y + t * dy
    const dist = Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2)

    if (dist < bestDist) {
      bestDist = dist
      bestPoint = { x: projX, y: projY }
    }
  }

  return { ...bestPoint, dist: bestDist }
}

/**
 * Finds the nearest boundary region for a given (x, y) point by checking
 * actual polygon edge proximity. This is used instead of the bounding-box
 * based findBoundaryRegion for via topology regions which are polygons
 * whose bounding boxes overlap.
 *
 * Only considers non-pad, non-throughJumper, non-connectionRegion regions
 * that have polygon data.
 */
export const findBoundaryRegionForPolygons = (
  x: number,
  y: number,
  regions: JRegion[],
): BoundaryRegionResult | null => {
  let closestRegion: JRegion | null = null
  let closestDistance = Infinity
  let closestPortPosition = { x, y }

  for (const region of regions) {
    if (
      region.d.isPad ||
      region.d.isThroughJumper ||
      region.d.isConnectionRegion
    )
      continue

    const polygon = region.d.polygon
    if (!polygon || polygon.length < 3) continue

    const result = closestPointOnPolygonEdge({ x, y }, polygon)

    if (result.dist < closestDistance) {
      closestDistance = result.dist
      closestRegion = region
      closestPortPosition = { x: result.x, y: result.y }
    }
  }

  if (closestRegion) {
    return { region: closestRegion, portPosition: closestPortPosition }
  }

  return null
}
