import type { Bounds, SharedBoundary, RegionData } from "./types"
import { TopologyError } from "./types"

const DEFAULT_TOLERANCE = 0.001

export function computeBoundsFromRegionData(data: RegionData): Bounds {
  if (data.bounds) {
    return data.bounds
  }

  if (data.polygon && data.polygon.length > 0) {
    let minX = data.polygon[0].x
    let maxX = data.polygon[0].x
    let minY = data.polygon[0].y
    let maxY = data.polygon[0].y

    for (let i = 1; i < data.polygon.length; i++) {
      const point = data.polygon[i]
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y)
      maxY = Math.max(maxY, point.y)
    }

    return { minX, maxX, minY, maxY }
  }

  if (data.center && data.width !== null && data.height !== null) {
    const halfW = data.width / 2
    const halfH = data.height / 2
    if (data.anchor === "center") {
      return {
        minX: data.center.x - halfW,
        maxX: data.center.x + halfW,
        minY: data.center.y - halfH,
        maxY: data.center.y + halfH,
      }
    } else {
      // anchor = "min"
      return {
        minX: data.center.x,
        maxX: data.center.x + data.width,
        minY: data.center.y,
        maxY: data.center.y + data.height,
      }
    }
  }

  throw new TopologyError(`Region "${data.id}" has incomplete geometry`, {
    regionIds: [data.id],
    suggestion: "Use .rect() or .center().size() to define the region geometry",
  })
}

export function computeCenterFromBounds(bounds: Bounds): {
  x: number
  y: number
} {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  }
}

export function validateBounds(bounds: Bounds, regionId: string): void {
  if (bounds.minX >= bounds.maxX) {
    throw new TopologyError(
      `Region "${regionId}" has invalid bounds: minX (${bounds.minX}) >= maxX (${bounds.maxX})`,
      {
        regionIds: [regionId],
        suggestion: "Ensure minX < maxX",
      },
    )
  }
  if (bounds.minY >= bounds.maxY) {
    throw new TopologyError(
      `Region "${regionId}" has invalid bounds: minY (${bounds.minY}) >= maxY (${bounds.maxY})`,
      {
        regionIds: [regionId],
        suggestion: "Ensure minY < maxY",
      },
    )
  }
}

export function findSharedBoundary(
  boundsA: Bounds,
  boundsB: Bounds,
  regionIdA: string,
  regionIdB: string,
  tolerance: number = DEFAULT_TOLERANCE,
): SharedBoundary {
  // Check for vertical shared boundary (A's right edge = B's left edge or vice versa)
  const verticalOverlapMin = Math.max(boundsA.minY, boundsB.minY)
  const verticalOverlapMax = Math.min(boundsA.maxY, boundsB.maxY)
  const verticalOverlapLength = verticalOverlapMax - verticalOverlapMin

  // Check for horizontal shared boundary (A's top edge = B's bottom edge or vice versa)
  const horizontalOverlapMin = Math.max(boundsA.minX, boundsB.minX)
  const horizontalOverlapMax = Math.min(boundsA.maxX, boundsB.maxX)
  const horizontalOverlapLength = horizontalOverlapMax - horizontalOverlapMin

  // A's right edge touches B's left edge
  if (
    Math.abs(boundsA.maxX - boundsB.minX) < tolerance &&
    verticalOverlapLength > tolerance
  ) {
    return {
      axis: "vertical",
      position: boundsA.maxX,
      min: verticalOverlapMin,
      max: verticalOverlapMax,
    }
  }

  // A's left edge touches B's right edge
  if (
    Math.abs(boundsA.minX - boundsB.maxX) < tolerance &&
    verticalOverlapLength > tolerance
  ) {
    return {
      axis: "vertical",
      position: boundsA.minX,
      min: verticalOverlapMin,
      max: verticalOverlapMax,
    }
  }

  // A's top edge touches B's bottom edge
  if (
    Math.abs(boundsA.maxY - boundsB.minY) < tolerance &&
    horizontalOverlapLength > tolerance
  ) {
    return {
      axis: "horizontal",
      position: boundsA.maxY,
      min: horizontalOverlapMin,
      max: horizontalOverlapMax,
    }
  }

  // A's bottom edge touches B's top edge
  if (
    Math.abs(boundsA.minY - boundsB.maxY) < tolerance &&
    horizontalOverlapLength > tolerance
  ) {
    return {
      axis: "horizontal",
      position: boundsA.minY,
      min: horizontalOverlapMin,
      max: horizontalOverlapMax,
    }
  }

  // No shared boundary found
  const relationship = describeRelationship(boundsA, boundsB)
  throw new TopologyError(
    `Regions "${regionIdA}" and "${regionIdB}" do not share a boundary`,
    {
      regionIds: [regionIdA, regionIdB],
      relationship,
      suggestion:
        "Use .port().between().at() for non-boundary ports, or check region positions",
    },
  )
}

function describeRelationship(boundsA: Bounds, boundsB: Bounds): string {
  const centerA = computeCenterFromBounds(boundsA)
  const centerB = computeCenterFromBounds(boundsB)

  const dx = centerB.x - centerA.x
  const dy = centerB.y - centerA.y

  let direction: string
  if (Math.abs(dx) > Math.abs(dy)) {
    direction = dx > 0 ? "to the right of" : "to the left of"
  } else {
    direction = dy > 0 ? "above" : "below"
  }

  // Check if they overlap
  const overlapsX = boundsA.maxX > boundsB.minX && boundsB.maxX > boundsA.minX
  const overlapsY = boundsA.maxY > boundsB.minY && boundsB.maxY > boundsA.minY

  if (overlapsX && overlapsY) {
    return `Regions overlap (A center: ${centerA.x.toFixed(2)}, ${centerA.y.toFixed(2)}; B center: ${centerB.x.toFixed(2)}, ${centerB.y.toFixed(2)})`
  }

  // Check if they only touch at a corner
  const touchesAtCornerX =
    Math.abs(boundsA.maxX - boundsB.minX) < 0.001 ||
    Math.abs(boundsA.minX - boundsB.maxX) < 0.001
  const touchesAtCornerY =
    Math.abs(boundsA.maxY - boundsB.minY) < 0.001 ||
    Math.abs(boundsA.minY - boundsB.maxY) < 0.001

  if (touchesAtCornerX && touchesAtCornerY) {
    return `Regions touch only at a corner (B is ${direction} A)`
  }

  return `B is ${direction} A with no shared edge`
}

export function computePortPositionOnBoundary(
  boundary: SharedBoundary,
  t: number,
): { x: number; y: number } {
  const pos = boundary.min + t * (boundary.max - boundary.min)
  if (boundary.axis === "vertical") {
    return { x: boundary.position, y: pos }
  } else {
    return { x: pos, y: boundary.position }
  }
}

export function computeEvenPortPositions(
  boundary: SharedBoundary,
  count: number,
  inset: "half" | number = "half",
): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = []
  const length = boundary.max - boundary.min

  for (let i = 0; i < count; i++) {
    let t: number
    if (inset === "half") {
      // Distribute with half-spacing from edges: (i + 0.5) / count
      t = (i + 0.5) / count
    } else {
      // Custom inset from edges
      const insetRatio = inset / length
      const usableRange = 1 - 2 * insetRatio
      if (count === 1) {
        t = 0.5
      } else {
        t = insetRatio + (i / (count - 1)) * usableRange
      }
    }
    positions.push(computePortPositionOnBoundary(boundary, t))
  }

  return positions
}

export function pointOnBoundary(
  point: { x: number; y: number },
  bounds: Bounds,
  tolerance: number = DEFAULT_TOLERANCE,
): boolean {
  const onVerticalEdge =
    (Math.abs(point.x - bounds.minX) < tolerance ||
      Math.abs(point.x - bounds.maxX) < tolerance) &&
    point.y >= bounds.minY - tolerance &&
    point.y <= bounds.maxY + tolerance

  const onHorizontalEdge =
    (Math.abs(point.y - bounds.minY) < tolerance ||
      Math.abs(point.y - bounds.maxY) < tolerance) &&
    point.x >= bounds.minX - tolerance &&
    point.x <= bounds.maxX + tolerance

  return onVerticalEdge || onHorizontalEdge
}

export function pointOnSharedBoundary(
  point: { x: number; y: number },
  boundary: SharedBoundary,
  tolerance: number = DEFAULT_TOLERANCE,
): boolean {
  if (boundary.axis === "vertical") {
    return (
      Math.abs(point.x - boundary.position) < tolerance &&
      point.y >= boundary.min - tolerance &&
      point.y <= boundary.max + tolerance
    )
  } else {
    return (
      Math.abs(point.y - boundary.position) < tolerance &&
      point.x >= boundary.min - tolerance &&
      point.x <= boundary.max + tolerance
    )
  }
}
