import type { JPort, JRegion } from "../JumperGraphSolver/jumper-types"
import type { Candidate, SolvedRoute } from "../types"
import type { RouteSegment, ViaData, ViaTile } from "./ViaGraphSolver"
import type { Point } from "graphics-debug"
export type ResolvedRouteLineSegment = {
  points: Point[]
  layer: "top" | "bottom"
}

const POINT_EPSILON = 1e-6

function arePointsEqual(a: Point, b: Point): boolean {
  return (
    Math.abs(a.x - b.x) <= POINT_EPSILON && Math.abs(a.y - b.y) <= POINT_EPSILON
  )
}

function appendPoint(points: Point[], point: Point): void {
  const lastPoint = points[points.length - 1]
  if (lastPoint && arePointsEqual(lastPoint, point)) return
  points.push(point)
}

function findNearestVia(vias: ViaData[], point: Point): ViaData | null {
  let bestVia: ViaData | null = null
  let bestDistance = Infinity

  for (const via of vias) {
    const dx = via.position.x - point.x
    const dy = via.position.y - point.y
    const distance = Math.hypot(dx, dy)
    if (distance < bestDistance) {
      bestDistance = distance
      bestVia = via
    }
  }

  return bestVia
}

function parseViaRegionNetName(regionId: string): string | null {
  const marker = ":v:"
  const markerIndex = regionId.lastIndexOf(marker)
  if (markerIndex !== -1) {
    return regionId.slice(markerIndex + marker.length)
  }
  const lastColonIndex = regionId.lastIndexOf(":")
  if (lastColonIndex === -1) return regionId
  return regionId.slice(lastColonIndex + 1)
}

function parseViaRegionTilePrefix(regionId: string): string | null {
  const marker = ":v:"
  const markerIndex = regionId.lastIndexOf(marker)
  if (markerIndex <= 0) return null
  return regionId.slice(0, markerIndex)
}

function getBottomRouteSegmentsForVias(
  viaTile: ViaTile,
  vias: ViaData[],
): RouteSegment[] {
  const viaIdSet = new Set(vias.map((via) => via.viaId))
  return viaTile.routeSegments.filter(
    (routeSegment) =>
      routeSegment.layer === "bottom" &&
      viaIdSet.has(routeSegment.fromPort) &&
      viaIdSet.has(routeSegment.toPort) &&
      routeSegment.segments.length >= 2,
  )
}

function selectViasForTraversedRegion(
  viaTile: ViaTile,
  viaRegion: JRegion,
): ViaData[] {
  const netName = parseViaRegionNetName(viaRegion.regionId)
  if (!netName) return []

  const viasForNet = viaTile.viasByNet[netName]
  if (!viasForNet || viasForNet.length === 0) return []

  const tilePrefix = parseViaRegionTilePrefix(viaRegion.regionId)
  if (!tilePrefix) return viasForNet

  const tileScopedVias = viasForNet.filter((via) =>
    via.viaId.startsWith(`${tilePrefix}:`),
  )

  return tileScopedVias.length > 0 ? tileScopedVias : viasForNet
}

function normalizeSegmentPoints(points: Point[]): Point[] {
  const normalized: Point[] = []
  for (const point of points) appendPoint(normalized, point)
  return normalized
}

function appendLineSegment(
  lineSegments: ResolvedRouteLineSegment[],
  points: Point[],
  layer: "top" | "bottom",
): void {
  const normalized = normalizeSegmentPoints(points)
  if (normalized.length < 2) return

  const lastLine = lineSegments[lineSegments.length - 1]
  if (!lastLine || lastLine.layer !== layer) {
    lineSegments.push({ points: normalized, layer })
    return
  }

  const lastPoint = lastLine.points[lastLine.points.length - 1]
  const firstPoint = normalized[0]
  if (!lastPoint || !firstPoint || !arePointsEqual(lastPoint, firstPoint)) {
    lineSegments.push({ points: normalized, layer })
    return
  }

  const continuation = normalized.slice(1)
  for (const point of continuation) {
    appendPoint(lastLine.points, point)
  }
}

function flattenLineSegments(
  lineSegments: ResolvedRouteLineSegment[],
): Point[] {
  const points: Point[] = []
  for (const lineSegment of lineSegments) {
    for (const point of lineSegment.points) {
      appendPoint(points, point)
    }
  }
  return points
}

export function resolveSolvedRouteLineSegments(
  solvedRoute: SolvedRoute,
  viaTile?: ViaTile,
): ResolvedRouteLineSegment[] {
  if (solvedRoute.path.length === 0) return []

  const path = solvedRoute.path as Candidate<JRegion, JPort>[]
  const lineSegments: ResolvedRouteLineSegment[] = []
  const drawnViaRegionIds = new Set<string>()

  for (let index = 1; index < path.length; index++) {
    const previousCandidate = path[index - 1]
    const currentCandidate = path[index]

    const previousPoint: Point = {
      x: previousCandidate.port.d.x,
      y: previousCandidate.port.d.y,
    }
    const currentPoint: Point = {
      x: currentCandidate.port.d.x,
      y: currentCandidate.port.d.y,
    }

    const traversedRegion = currentCandidate.lastRegion
    const isViaRegionTraversal = !!viaTile && !!traversedRegion?.d?.isViaRegion

    if (!isViaRegionTraversal) {
      appendLineSegment(lineSegments, [previousPoint, currentPoint], "top")
      continue
    }

    const viasForRegion = selectViasForTraversedRegion(viaTile, traversedRegion)
    if (viasForRegion.length === 0) continue

    // Top layer enters/exits via region at via centers.
    const entryVia = findNearestVia(viasForRegion, previousPoint)
    const exitVia = findNearestVia(viasForRegion, currentPoint)
    if (entryVia) {
      appendLineSegment(lineSegments, [previousPoint, entryVia.position], "top")
    }

    const bottomRouteSegments = getBottomRouteSegmentsForVias(
      viaTile,
      viasForRegion,
    )
    if (
      bottomRouteSegments.length > 0 &&
      !drawnViaRegionIds.has(traversedRegion.regionId)
    ) {
      // Render via-region traces only from viaTile bottom segments.
      drawnViaRegionIds.add(traversedRegion.regionId)
      for (const routeSegment of bottomRouteSegments) {
        appendLineSegment(lineSegments, routeSegment.segments, "bottom")
      }
    }

    if (exitVia) {
      appendLineSegment(lineSegments, [exitVia.position, currentPoint], "top")
    }
  }

  return lineSegments
}

export function resolveSolvedRoutePoints(
  solvedRoute: SolvedRoute,
  viaTile?: ViaTile,
): Point[] {
  const lineSegments = resolveSolvedRouteLineSegments(solvedRoute, viaTile)
  return flattenLineSegments(lineSegments)
}
