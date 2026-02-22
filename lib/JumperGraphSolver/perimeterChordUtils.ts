import type { JPort, JRegion } from "./jumper-types"

type Pt = { x: number; y: number }

type PolygonPerimeterCache = {
  edgeLengths: number[]
  cumulative: number[]
  perimeter: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function dist2(a: Pt, b: Pt): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

function getRectanglePerimeter(
  xmin: number,
  xmax: number,
  ymin: number,
  ymax: number,
): number {
  return 2 * (xmax - xmin) + 2 * (ymax - ymin)
}

/**
 * Maps a boundary point to a 1D perimeter coordinate.
 * Starting at top-left corner, going clockwise:
 * - Top edge (y=ymax): t = x - xmin
 * - Right edge (x=xmax): t = W + (ymax - y)
 * - Bottom edge (y=ymin): t = W + H + (xmax - x)
 * - Left edge (x=xmin): t = 2W + H + (y - ymin)
 */
export function perimeterT(
  p: Pt,
  xmin: number,
  xmax: number,
  ymin: number,
  ymax: number,
): number {
  const W = xmax - xmin
  const H = ymax - ymin
  const eps = 1e-6

  if (Math.abs(p.y - ymax) < eps) return p.x - xmin
  if (Math.abs(p.x - xmax) < eps) return W + (ymax - p.y)
  if (Math.abs(p.y - ymin) < eps) return W + H + (xmax - p.x)
  if (Math.abs(p.x - xmin) < eps) return 2 * W + H + (p.y - ymin)

  const distTop = Math.abs(p.y - ymax)
  const distRight = Math.abs(p.x - xmax)
  const distBottom = Math.abs(p.y - ymin)
  const distLeft = Math.abs(p.x - xmin)
  const minDist = Math.min(distTop, distRight, distBottom, distLeft)

  if (minDist === distTop) return Math.max(0, Math.min(W, p.x - xmin))
  if (minDist === distRight) return W + Math.max(0, Math.min(H, ymax - p.y))
  if (minDist === distBottom) {
    return W + H + Math.max(0, Math.min(W, xmax - p.x))
  }
  return 2 * W + H + Math.max(0, Math.min(H, p.y - ymin))
}

function projectToSegment(p: Pt, a: Pt, b: Pt): { u: number; d2: number } {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const apx = p.x - a.x
  const apy = p.y - a.y
  const ab2 = abx * abx + aby * aby
  const u = ab2 > 0 ? clamp((apx * abx + apy * aby) / ab2, 0, 1) : 0
  const q = { x: a.x + u * abx, y: a.y + u * aby }
  return { u, d2: dist2(p, q) }
}

function createPolygonPerimeterCache(polygon: Pt[]): PolygonPerimeterCache {
  const n = polygon.length
  const edgeLengths: number[] = new Array(n)
  const cumulative: number[] = new Array(n + 1)
  cumulative[0] = 0

  for (let i = 0; i < n; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % n]
    const edgeLength = Math.hypot(b.x - a.x, b.y - a.y)
    edgeLengths[i] = edgeLength
    cumulative[i + 1] = cumulative[i] + edgeLength
  }

  return { edgeLengths, cumulative, perimeter: cumulative[n] }
}

function perimeterTPolygonWithCache(
  p: Pt,
  polygon: Pt[],
  cache: PolygonPerimeterCache,
  eps = 1e-6,
): number {
  let bestEdgeIndex = 0
  let bestU = 0
  let bestD2 = Number.POSITIVE_INFINITY
  const eps2 = eps * eps

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const projected = projectToSegment(p, a, b)

    if (projected.d2 <= eps2) {
      bestEdgeIndex = i
      bestU = projected.u
      bestD2 = projected.d2
      break
    }

    if (projected.d2 < bestD2) {
      bestEdgeIndex = i
      bestU = projected.u
      bestD2 = projected.d2
    }
  }

  return (
    cache.cumulative[bestEdgeIndex] + bestU * cache.edgeLengths[bestEdgeIndex]
  )
}

export function perimeterTPolygon(p: Pt, polygon: Pt[], eps = 1e-6): number {
  if (polygon.length < 3) {
    throw new Error("Polygon must have at least 3 vertices")
  }
  const cache = createPolygonPerimeterCache(polygon)
  return perimeterTPolygonWithCache(p, polygon, cache, eps)
}

function getRegionPolygonCache(region: JRegion): PolygonPerimeterCache | null {
  const polygon = region.d.polygon
  if (!polygon || polygon.length < 3) return null

  const existing = region.d.polygonPerimeterCache as
    | PolygonPerimeterCache
    | undefined
  if (existing) return existing

  const cache = createPolygonPerimeterCache(polygon)
  region.d.polygonPerimeterCache = cache
  return cache
}

export function getRegionPerimeter(region: JRegion): number {
  const polygonCache = getRegionPolygonCache(region)
  if (polygonCache) return polygonCache.perimeter

  const { minX, maxX, minY, maxY } = region.d.bounds
  return getRectanglePerimeter(minX, maxX, minY, maxY)
}

export function getPortPerimeterTInRegion(
  port: JPort,
  region: JRegion,
): number {
  if (port.region1 === region) {
    if (typeof port.region1T === "number") return port.region1T
    const t = getPointPerimeterTInRegion(port.d, region)
    port.region1T = t
    return t
  }

  if (port.region2 === region) {
    if (typeof port.region2T === "number") return port.region2T
    const t = getPointPerimeterTInRegion(port.d, region)
    port.region2T = t
    return t
  }

  return getPointPerimeterTInRegion(port.d, region)
}

function getPointPerimeterTInRegion(p: Pt, region: JRegion): number {
  const polygon = region.d.polygon
  if (polygon && polygon.length >= 3) {
    const cache = getRegionPolygonCache(region)
    if (cache) return perimeterTPolygonWithCache(p, polygon, cache)
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

function normalizeMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus
}

function areCoincidentOnCircle(
  t1: number,
  t2: number,
  perimeter: number,
  eps: number,
): boolean {
  const delta = Math.abs(normalizeMod(t1 - t2, perimeter))
  return delta < eps || perimeter - delta < eps
}

function betweenMod(
  x: number,
  start: number,
  end: number,
  perimeter: number,
  eps: number,
): boolean {
  const nx = normalizeMod(x, perimeter)
  const ns = normalizeMod(start, perimeter)
  const ne = normalizeMod(end, perimeter)

  if (Math.abs(ns - ne) < eps) return false
  if (ns < ne) return ns < nx && nx < ne
  return nx > ns || nx < ne
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
  perimeter?: number,
): boolean {
  if (typeof perimeter === "number" && perimeter > 0) {
    let [a, b] = chord1
    let [c, d] = chord2

    a = normalizeMod(a, perimeter)
    b = normalizeMod(b, perimeter)
    c = normalizeMod(c, perimeter)
    d = normalizeMod(d, perimeter)

    if (
      areCoincidentOnCircle(a, c, perimeter, 1e-6) ||
      areCoincidentOnCircle(a, d, perimeter, 1e-6) ||
      areCoincidentOnCircle(b, c, perimeter, 1e-6) ||
      areCoincidentOnCircle(b, d, perimeter, 1e-6)
    ) {
      return false
    }

    const cInside = betweenMod(c, a, b, perimeter, 1e-12)
    const dInside = betweenMod(d, a, b, perimeter, 1e-12)
    return cInside !== dInside
  }

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
