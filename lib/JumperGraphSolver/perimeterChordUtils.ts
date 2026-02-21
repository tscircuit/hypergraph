/**
 * Maps a boundary point to a 1D perimeter coordinate.
 * Starting at top-left corner, going clockwise:
 * - Top edge (y=ymax): t = x - xmin
 * - Right edge (x=xmax): t = W + (ymax - y)
 * - Bottom edge (y=ymin): t = 2W + H + (xmax - x)
 * - Left edge (x=xmin): t = 2W + 2H + (y - ymin)
 */
export function perimeterT(
  p: { x: number; y: number },
  xmin: number,
  xmax: number,
  ymin: number,
  ymax: number,
): number {
  const W = xmax - xmin
  const H = ymax - ymin
  const eps = 1e-6

  // Top edge
  if (Math.abs(p.y - ymax) < eps) {
    return p.x - xmin
  }
  // Right edge
  if (Math.abs(p.x - xmax) < eps) {
    return W + (ymax - p.y)
  }
  // Bottom edge
  if (Math.abs(p.y - ymin) < eps) {
    return W + H + (xmax - p.x)
  }
  // Left edge
  if (Math.abs(p.x - xmin) < eps) {
    return 2 * W + H + (p.y - ymin)
  }

  // Point is not exactly on boundary - find closest edge
  const distTop = Math.abs(p.y - ymax)
  const distRight = Math.abs(p.x - xmax)
  const distBottom = Math.abs(p.y - ymin)
  const distLeft = Math.abs(p.x - xmin)

  const minDist = Math.min(distTop, distRight, distBottom, distLeft)

  if (minDist === distTop) {
    return Math.max(0, Math.min(W, p.x - xmin))
  }
  if (minDist === distRight) {
    return W + Math.max(0, Math.min(H, ymax - p.y))
  }
  if (minDist === distBottom) {
    return W + H + Math.max(0, Math.min(W, xmax - p.x))
  }
  // Left edge
  return 2 * W + H + Math.max(0, Math.min(H, p.y - ymin))
}

type PolygonPoint = { x: number; y: number }

const getDistanceToSegmentAndProjectedLength = (
  point: PolygonPoint,
  a: PolygonPoint,
  b: PolygonPoint,
): { distance: number; projectedLength: number; segmentLength: number } => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const segmentLength = Math.hypot(dx, dy)
  if (segmentLength < 1e-12) {
    return {
      distance: Math.hypot(point.x - a.x, point.y - a.y),
      projectedLength: 0,
      segmentLength,
    }
  }

  const ux = dx / segmentLength
  const uy = dy / segmentLength
  const vx = point.x - a.x
  const vy = point.y - a.y
  const projected = Math.max(0, Math.min(segmentLength, vx * ux + vy * uy))
  const closestX = a.x + projected * ux
  const closestY = a.y + projected * uy

  return {
    distance: Math.hypot(point.x - closestX, point.y - closestY),
    projectedLength: projected,
    segmentLength,
  }
}

export function perimeterTOnPolygon(
  p: PolygonPoint,
  polygon: PolygonPoint[],
): number {
  if (polygon.length < 3) return 0

  let totalPerimeter = 0
  const segmentData: Array<{
    a: PolygonPoint
    b: PolygonPoint
    cumLength: number
  }> = []

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    if (!a || !b) continue
    segmentData.push({ a, b, cumLength: totalPerimeter })
    totalPerimeter += Math.hypot(b.x - a.x, b.y - a.y)
  }

  if (totalPerimeter < 1e-12) return 0

  let bestT = 0
  let bestDistance = Number.POSITIVE_INFINITY

  for (const seg of segmentData) {
    const { distance, projectedLength, segmentLength } =
      getDistanceToSegmentAndProjectedLength(p, seg.a, seg.b)
    if (segmentLength < 1e-12) continue

    const candidateT = seg.cumLength + projectedLength
    if (distance < bestDistance) {
      bestDistance = distance
      bestT = candidateT
    }
  }

  return bestT
}

export function perimeterTForRegion(
  p: { x: number; y: number },
  region: {
    d: {
      bounds: { minX: number; maxX: number; minY: number; maxY: number }
      polygon?: PolygonPoint[]
    }
  },
): number {
  if (Array.isArray(region.d.polygon) && region.d.polygon.length >= 3) {
    return perimeterTOnPolygon(p, region.d.polygon)
  }

  const { minX, maxX, minY, maxY } = region.d.bounds
  return perimeterT(p, minX, maxX, minY, maxY)
}

/**
 * Check if two perimeter coordinates are coincident (within epsilon)
 */
function areCoincident(t1: number, t2: number, eps = 1e-6): boolean {
  return Math.abs(t1 - t2) < eps
}

/**
 * Check if two chords cross using the interleaving criterion.
 * Two chords (a,b) and (c,d) with a < b and c < d cross iff: a < c < b < d OR c < a < d < b
 *
 * Chords that share a coincident endpoint do NOT count as crossing.
 */
export function chordsCross(
  chord1: [number, number],
  chord2: [number, number],
): boolean {
  // Normalize each chord so first endpoint is smaller
  const [a, b] = chord1[0] < chord1[1] ? chord1 : [chord1[1], chord1[0]]
  const [c, d] = chord2[0] < chord2[1] ? chord2 : [chord2[1], chord2[0]]

  // Skip if chords share a coincident endpoint
  if (
    areCoincident(a, c) ||
    areCoincident(a, d) ||
    areCoincident(b, c) ||
    areCoincident(b, d)
  ) {
    return false
  }

  // Two chords cross iff their endpoints interleave: a < c < b < d OR c < a < d < b
  return (a < c && c < b && b < d) || (c < a && a < d && d < b)
}
