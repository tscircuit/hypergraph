import type { JRegion } from "lib/JumperGraphSolver/jumper-types"
import type { SolvedRoute } from "lib/types"

type Point = { x: number; y: number }

type Segment = {
  start: Point
  end: Point
  connectionId: string
  regionId: string
  isPadRegion: boolean
  isThroughJumperRegion: boolean
}

export type TraceIntersectionViolation = {
  connectionAId: string
  connectionBId: string
  regionId: string
  regionLabel: string
  isPadRegion: boolean
  isThroughJumperRegion: boolean
  point: Point
}

const EPS = 1e-6

const getProperSegmentIntersection = (
  aStart: Point,
  aEnd: Point,
  bStart: Point,
  bEnd: Point,
): Point | null => {
  const aDx = aEnd.x - aStart.x
  const aDy = aEnd.y - aStart.y
  const bDx = bEnd.x - bStart.x
  const bDy = bEnd.y - bStart.y

  const denom = aDx * bDy - aDy * bDx
  if (Math.abs(denom) < EPS) return null

  const sx = bStart.x - aStart.x
  const sy = bStart.y - aStart.y

  const t = (sx * bDy - sy * bDx) / denom
  const u = (sx * aDy - sy * aDx) / denom

  if (t <= EPS || t >= 1 - EPS || u <= EPS || u >= 1 - EPS) {
    return null
  }

  return {
    x: aStart.x + t * aDx,
    y: aStart.y + t * aDy,
  }
}

const getRouteSegments = (solvedRoutes: SolvedRoute[]): Segment[] => {
  const segments: Segment[] = []

  for (const solvedRoute of solvedRoutes) {
    const connectionId = solvedRoute.connection.connectionId
    for (let i = 1; i < solvedRoute.path.length; i++) {
      const prev = solvedRoute.path[i - 1]
      const curr = solvedRoute.path[i]
      if (!prev || !curr) continue

      const start = { x: prev.port.d.x, y: prev.port.d.y }
      const end = { x: curr.port.d.x, y: curr.port.d.y }

      if (Math.abs(start.x - end.x) < EPS && Math.abs(start.y - end.y) < EPS) {
        continue
      }

      const region = curr.lastRegion
      if (!region) continue

      segments.push({
        start,
        end,
        connectionId,
        regionId: region.regionId,
        isPadRegion: Boolean(region.d?.isPad),
        isThroughJumperRegion: Boolean(region.d?.isThroughJumper),
      })
    }
  }

  return segments
}

export const getTraceIntersectionsOutsideThroughJumpers = (
  solvedRoutes: SolvedRoute[],
  regions: JRegion[],
): TraceIntersectionViolation[] => {
  const segments = getRouteSegments(solvedRoutes)
  const regionById = new Map(regions.map((r) => [r.regionId, r]))
  const nonPadNonThroughJumperLabelByRegionId = new Map(
    regions
      .filter((r) => !r.d.isPad && !r.d.isThroughJumper)
      .map((region, index) => [region.regionId, `R${index + 1}`]),
  )
  const violations: TraceIntersectionViolation[] = []

  for (let i = 0; i < segments.length; i++) {
    const segA = segments[i]
    if (!segA) continue

    for (let j = i + 1; j < segments.length; j++) {
      const segB = segments[j]
      if (!segB) continue
      if (segA.connectionId === segB.connectionId) continue
      if (segA.regionId !== segB.regionId) continue

      const intersection = getProperSegmentIntersection(
        segA.start,
        segA.end,
        segB.start,
        segB.end,
      )

      if (!intersection) continue
      if (segA.isThroughJumperRegion || segB.isThroughJumperRegion) continue
      if (segA.isPadRegion || segB.isPadRegion) continue

      const region = regionById.get(segA.regionId)
      if (!region) continue

      violations.push({
        connectionAId: segA.connectionId,
        connectionBId: segB.connectionId,
        regionId: segA.regionId,
        regionLabel:
          nonPadNonThroughJumperLabelByRegionId.get(segA.regionId) ??
          segA.regionId,
        isPadRegion: Boolean(region.d.isPad),
        isThroughJumperRegion: Boolean(region.d.isThroughJumper),
        point: intersection,
      })
    }
  }

  return violations
}

export const assertNoTraceIntersectionsOutsideThroughJumpers = (
  solvedRoutes: SolvedRoute[],
  regions: JRegion[],
) => {
  const violations = getTraceIntersectionsOutsideThroughJumpers(
    solvedRoutes,
    regions,
  )

  if (violations.length > 0) {
    throw new Error(
      [
        `Found ${violations.length} trace intersection(s) outside through-jumper regions`,
        ...violations
          .slice(0, 10)
          .map(
            (v) =>
              `${v.connectionAId}[${v.regionLabel}] x ${v.connectionBId}[${v.regionLabel}] @ (${v.point.x.toFixed(3)}, ${v.point.y.toFixed(3)})`,
          ),
      ].join("\n"),
    )
  }
}
