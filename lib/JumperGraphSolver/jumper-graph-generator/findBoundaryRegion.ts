import type { Bounds } from "../Bounds"
import type { JRegion } from "../jumper-types"

type Side = "left" | "right" | "top" | "bottom"

const EPS = 0.01

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value))
}

const getBoundarySidesForPoint = (
  x: number,
  y: number,
  graphBounds: Bounds,
): Side[] => {
  const sides: Side[] = []
  if (Math.abs(x - graphBounds.minX) < EPS) sides.push("left")
  if (Math.abs(x - graphBounds.maxX) < EPS) sides.push("right")
  if (Math.abs(y - graphBounds.maxY) < EPS) sides.push("top")
  if (Math.abs(y - graphBounds.minY) < EPS) sides.push("bottom")
  return sides
}

const isPointOnSide = (p: { x: number; y: number }, side: Side, b: Bounds) => {
  if (side === "left") return Math.abs(p.x - b.minX) < EPS
  if (side === "right") return Math.abs(p.x - b.maxX) < EPS
  if (side === "top") return Math.abs(p.y - b.maxY) < EPS
  return Math.abs(p.y - b.minY) < EPS
}

const projectToSegment = (
  x: number,
  y: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
) => {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const apx = x - a.x
  const apy = y - a.y
  const ab2 = abx * abx + aby * aby
  const t = ab2 > 0 ? clamp((apx * abx + apy * aby) / ab2, 0, 1) : 0
  const px = a.x + t * abx
  const py = a.y + t * aby
  const dx = x - px
  const dy = y - py
  return {
    x: px,
    y: py,
    d2: dx * dx + dy * dy,
  }
}

const getRegionBoundaryProjection = (
  x: number,
  y: number,
  region: JRegion,
  graphBounds: Bounds,
  preferredSides: Side[],
): { x: number; y: number; d2: number } | null => {
  const polygon = region.d.polygon

  if (polygon && polygon.length >= 3) {
    const sideSet = new Set(preferredSides)
    let best: { x: number; y: number; d2: number } | null = null

    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]
      const b = polygon[(i + 1) % polygon.length]

      if (preferredSides.length > 0) {
        const edgeOnPreferredSide = preferredSides.some(
          (side) =>
            isPointOnSide(a, side, graphBounds) &&
            isPointOnSide(b, side, graphBounds) &&
            sideSet.has(side),
        )
        if (!edgeOnPreferredSide) continue
      }

      const p = projectToSegment(x, y, a, b)
      if (!best || p.d2 < best.d2) {
        best = p
      }
    }

    if (best) return best
  }

  const bounds = region.d.bounds

  const sideCandidates: Array<{ side: Side; x: number; y: number }> = []
  if (preferredSides.length > 0) {
    for (const side of preferredSides) {
      if (side === "left") {
        sideCandidates.push({
          side,
          x: bounds.minX,
          y: clamp(y, bounds.minY, bounds.maxY),
        })
      } else if (side === "right") {
        sideCandidates.push({
          side,
          x: bounds.maxX,
          y: clamp(y, bounds.minY, bounds.maxY),
        })
      } else if (side === "top") {
        sideCandidates.push({
          side,
          x: clamp(x, bounds.minX, bounds.maxX),
          y: bounds.maxY,
        })
      } else {
        sideCandidates.push({
          side,
          x: clamp(x, bounds.minX, bounds.maxX),
          y: bounds.minY,
        })
      }
    }
  }

  if (sideCandidates.length === 0) {
    sideCandidates.push(
      { side: "left", x: bounds.minX, y: clamp(y, bounds.minY, bounds.maxY) },
      {
        side: "right",
        x: bounds.maxX,
        y: clamp(y, bounds.minY, bounds.maxY),
      },
      { side: "top", x: clamp(x, bounds.minX, bounds.maxX), y: bounds.maxY },
      {
        side: "bottom",
        x: clamp(x, bounds.minX, bounds.maxX),
        y: bounds.minY,
      },
    )
  }

  let best: { x: number; y: number; d2: number } | null = null
  for (const c of sideCandidates) {
    if (preferredSides.length > 0 && !preferredSides.includes(c.side)) continue
    const dx = x - c.x
    const dy = y - c.y
    const d2 = dx * dx + dy * dy
    if (!best || d2 < best.d2) {
      best = { x: c.x, y: c.y, d2 }
    }
  }

  return best
}

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
  const preferredSides = getBoundarySidesForPoint(x, y, graphBounds)

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

    const projection = getRegionBoundaryProjection(
      x,
      y,
      region,
      graphBounds,
      preferredSides,
    )

    if (!projection) continue

    const dist = Math.sqrt(projection.d2)

    if (dist < closestDistance) {
      closestDistance = dist
      closestRegion = region
      closestPortPosition = { x: projection.x, y: projection.y }
    }
  }

  if (closestRegion) {
    return { region: closestRegion, portPosition: closestPortPosition }
  }

  return null
}
