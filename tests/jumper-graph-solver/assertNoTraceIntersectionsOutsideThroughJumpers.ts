import type { JRegion } from "lib/JumperGraphSolver/jumper-types"
import type { SolvedRoute } from "lib/types"

type Point = { x: number; y: number }

type Segment = {
  start: Point
  end: Point
  connectionId: string
  regionId: string
  isThroughJumperRegion: boolean
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
        isThroughJumperRegion: Boolean(region.d?.isThroughJumper),
      })
    }
  }

  return segments
}

export const assertNoTraceIntersectionsOutsideThroughJumpers = (
  solvedRoutes: SolvedRoute[],
  _regions: JRegion[],
) => {
  const segments = getRouteSegments(solvedRoutes)
  const violations: string[] = []

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

      violations.push(
        `${segA.connectionId}[${segA.regionId}] x ${segB.connectionId}[${segB.regionId}] @ (${intersection.x.toFixed(3)}, ${intersection.y.toFixed(3)})`,
      )
    }
  }

  if (violations.length > 0) {
    throw new Error(
      [
        `Found ${violations.length} trace intersection(s) outside through-jumper regions`,
        ...violations.slice(0, 10),
      ].join("\n"),
    )
  }
}
