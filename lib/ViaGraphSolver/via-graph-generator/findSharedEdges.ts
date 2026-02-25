type Point = { x: number; y: number }

type SharedEdge = {
  from: Point
  to: Point
}

/**
 * Check if two line segments are collinear (lie on the same line).
 */
function areCollinear(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
  tolerance: number,
): boolean {
  // Direction vectors
  const dax = a2.x - a1.x
  const day = a2.y - a1.y
  const dbx = b2.x - b1.x
  const dby = b2.y - b1.y

  // Check if parallel (cross product ~ 0)
  const cross = dax * dby - day * dbx
  const lenA = Math.sqrt(dax * dax + day * day)
  const lenB = Math.sqrt(dbx * dbx + dby * dby)

  if (lenA < tolerance || lenB < tolerance) return false

  // Normalize cross product
  const normalizedCross = Math.abs(cross) / (lenA * lenB)
  if (normalizedCross > tolerance) return false

  // Check if b1 lies on the line defined by a1-a2
  // Distance from b1 to line a1-a2
  const vx = b1.x - a1.x
  const vy = b1.y - a1.y
  const crossToB1 = Math.abs(dax * vy - day * vx) / lenA

  return crossToB1 < tolerance
}

/**
 * Project a point onto a line segment and return the parameter t (0-1 if on segment).
 */
function projectOntoSegment(
  p: Point,
  a: Point,
  b: Point,
): { t: number; distance: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy

  if (lenSq < 1e-12) {
    // Degenerate segment
    const dist = Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2)
    return { t: 0, distance: dist }
  }

  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq

  // Closest point on infinite line
  const closestX = a.x + t * dx
  const closestY = a.y + t * dy
  const distance = Math.sqrt((p.x - closestX) ** 2 + (p.y - closestY) ** 2)

  return { t, distance }
}

/**
 * Compute the overlap of two 1D ranges, returns null if no overlap.
 */
function rangeOverlap(
  t1Start: number,
  t1End: number,
  t2Start: number,
  t2End: number,
): { from: number; to: number } | null {
  const min1 = Math.min(t1Start, t1End)
  const max1 = Math.max(t1Start, t1End)
  const min2 = Math.min(t2Start, t2End)
  const max2 = Math.max(t2Start, t2End)

  const overlapStart = Math.max(min1, min2)
  const overlapEnd = Math.min(max1, max2)

  if (overlapEnd - overlapStart < 1e-6) return null
  return { from: overlapStart, to: overlapEnd }
}

/**
 * Find shared edges between two polygons.
 *
 * Returns an array of line segments that are shared (overlapping collinear edges)
 * between the two polygons.
 *
 * @param polygon1 - First polygon as array of points (closed loop, last connects to first)
 * @param polygon2 - Second polygon as array of points
 * @param tolerance - Distance tolerance for considering edges as shared (default 0.01)
 * @returns Array of shared edge segments
 */
export function findSharedEdges(
  polygon1: Point[],
  polygon2: Point[],
  tolerance = 0.01,
): SharedEdge[] {
  const sharedEdges: SharedEdge[] = []

  // Iterate all edges of polygon1
  for (let i = 0; i < polygon1.length; i++) {
    const a1 = polygon1[i]
    const a2 = polygon1[(i + 1) % polygon1.length]

    // Iterate all edges of polygon2
    for (let j = 0; j < polygon2.length; j++) {
      const b1 = polygon2[j]
      const b2 = polygon2[(j + 1) % polygon2.length]

      // Check if edges are collinear
      if (!areCollinear(a1, a2, b1, b2, tolerance)) continue

      // Project polygon2 edge endpoints onto polygon1 edge
      const proj1 = projectOntoSegment(b1, a1, a2)
      const proj2 = projectOntoSegment(b2, a1, a2)

      // Check if both endpoints are close to the line
      if (proj1.distance > tolerance || proj2.distance > tolerance) continue

      // Find overlap in parameter space of edge a1-a2
      const overlap = rangeOverlap(0, 1, proj1.t, proj2.t)
      if (!overlap) continue

      // Convert back to world coordinates
      const dx = a2.x - a1.x
      const dy = a2.y - a1.y
      const from: Point = {
        x: a1.x + overlap.from * dx,
        y: a1.y + overlap.from * dy,
      }
      const to: Point = {
        x: a1.x + overlap.to * dx,
        y: a1.y + overlap.to * dy,
      }

      // Only add if the edge has non-trivial length
      const edgeLen = Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2)
      if (edgeLen > tolerance) {
        sharedEdges.push({ from, to })
      }
    }
  }

  return sharedEdges
}

/**
 * Create evenly-spaced ports along a shared edge.
 *
 * @param edge - The shared edge segment
 * @param portPitch - Distance between ports (default 0.4mm)
 * @returns Array of port positions
 */
export function createPortsAlongEdge(
  edge: SharedEdge,
  portPitch = 0.4,
): Point[] {
  const dx = edge.to.x - edge.from.x
  const dy = edge.to.y - edge.from.y
  const length = Math.sqrt(dx * dx + dy * dy)

  if (length < 0.001) return []

  const count = Math.max(1, Math.floor(length / portPitch))
  const ports: Point[] = []

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    ports.push({
      x: edge.from.x + t * dx,
      y: edge.from.y + t * dy,
    })
  }

  return ports
}
