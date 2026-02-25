import { ConvexRegionsSolver } from "@tscircuit/find-convex-regions"
import type {
  JPort,
  JRegion,
  JumperGraph,
} from "../../JumperGraphSolver/jumper-types"
import type { RouteSegment, ViaTile } from "../ViaGraphSolver"
import { createPortsAlongEdge, findSharedEdges } from "./findSharedEdges"

/**
 * Default port pitch (mm) for distributing ports along shared boundaries.
 */
const DEFAULT_PORT_PITCH = 0.4

/**
 * Default tile size (mm) for via placement.
 */
const DEFAULT_TILE_SIZE = 5

/**
 * Default clearance (mm) around via regions for convex region computation.
 */
const DEFAULT_CLEARANCE = 0.1

type Point = { x: number; y: number }
type Bounds = { minX: number; maxX: number; minY: number; maxY: number }

type HorizontalSegment = { xStart: number; xEnd: number; y: number }
type VerticalSegment = { x: number; yStart: number; yEnd: number }
type SideName = "top" | "bottom" | "left" | "right"
type ViaPortCandidate = {
  convexRegion: JRegion
  position: Point
  side: SideName
  primaryDistance: number
  orthDistance: number
  key: string
}

/**
 * Remove consecutive duplicate points from a polygon.
 * Points are considered duplicates if they are within tolerance distance.
 */
function deduplicateConsecutivePoints(
  points: Point[],
  tolerance = 0.001,
): Point[] {
  if (points.length <= 1) return points

  const result: Point[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1]
    const curr = points[i]
    const dist = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2)
    if (dist > tolerance) {
      result.push(curr)
    }
  }

  // Also check if last point equals first point (for closed polygons)
  if (result.length > 1) {
    const first = result[0]
    const last = result[result.length - 1]
    const dist = Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2)
    if (dist < tolerance) {
      result.pop()
    }
  }

  return result
}

/**
 * Compute bounding box from polygon points.
 */
function boundsFromPolygon(points: Point[]): Bounds {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, maxX, minY, maxY }
}

/**
 * Compute centroid of polygon.
 */
function centroid(points: Point[]): Point {
  let cx = 0
  let cy = 0
  for (const p of points) {
    cx += p.x
    cy += p.y
  }
  return { x: cx / points.length, y: cy / points.length }
}

function classifySideFromBounds(point: Point, bounds: Bounds): SideName {
  const distances: Record<SideName, number> = {
    left: Math.abs(point.x - bounds.minX),
    right: Math.abs(point.x - bounds.maxX),
    bottom: Math.abs(point.y - bounds.minY),
    top: Math.abs(point.y - bounds.maxY),
  }

  let bestSide: SideName = "left"
  let bestDistance = distances.left
  for (const side of ["right", "bottom", "top"] as const) {
    if (distances[side] < bestDistance) {
      bestSide = side
      bestDistance = distances[side]
    }
  }

  return bestSide
}

function toCandidateKey(regionId: string, point: Point): string {
  return `${regionId}:${point.x.toFixed(6)},${point.y.toFixed(6)}`
}

function compareCandidateQuality(
  a: ViaPortCandidate,
  b: ViaPortCandidate,
): number {
  if (Math.abs(a.primaryDistance - b.primaryDistance) > 1e-6) {
    return b.primaryDistance - a.primaryDistance
  }
  if (Math.abs(a.orthDistance - b.orthDistance) > 1e-6) {
    return a.orthDistance - b.orthDistance
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
}

/**
 * Create a JRegion from a polygon.
 */
function createRegionFromPolygon(
  regionId: string,
  polygon: Point[],
  opts?: { isViaRegion?: boolean },
): JRegion {
  const bounds = boundsFromPolygon(polygon)
  return {
    regionId,
    ports: [],
    d: {
      bounds,
      center: centroid(polygon),
      polygon,
      isPad: false,
      isViaRegion: opts?.isViaRegion,
    },
  }
}

/**
 * Generate a via region polygon for a single net's vias.
 * The polygon wraps around all vias for that net.
 */
function generateViaRegionPolygon(
  vias: Array<{ viaId: string; diameter: number; position: Point }>,
): Point[] {
  if (vias.length === 0) return []

  // Find extreme vias
  const topVia = vias.reduce((best, v) =>
    v.position.y > best.position.y ? v : best,
  )
  const bottomVia = vias.reduce((best, v) =>
    v.position.y < best.position.y ? v : best,
  )
  const leftVia = vias.reduce((best, v) =>
    v.position.x < best.position.x ? v : best,
  )
  const rightVia = vias.reduce((best, v) =>
    v.position.x > best.position.x ? v : best,
  )

  // Compute edge segments
  const topSeg: HorizontalSegment = {
    xStart: topVia.position.x - topVia.diameter / 2,
    xEnd: topVia.position.x + topVia.diameter / 2,
    y: topVia.position.y + topVia.diameter / 2,
  }
  const botSeg: HorizontalSegment = {
    xStart: bottomVia.position.x - bottomVia.diameter / 2,
    xEnd: bottomVia.position.x + bottomVia.diameter / 2,
    y: bottomVia.position.y - bottomVia.diameter / 2,
  }
  const leftSeg: VerticalSegment = {
    x: leftVia.position.x - leftVia.diameter / 2,
    yStart: leftVia.position.y - leftVia.diameter / 2,
    yEnd: leftVia.position.y + leftVia.diameter / 2,
  }
  const rightSeg: VerticalSegment = {
    x: rightVia.position.x + rightVia.diameter / 2,
    yStart: rightVia.position.y - rightVia.diameter / 2,
    yEnd: rightVia.position.y + rightVia.diameter / 2,
  }

  // Build polygon (clockwise):
  // top-left -> top-right -> right-top -> right-bottom ->
  // bottom-right -> bottom-left -> left-bottom -> left-top -> close
  const rawPolygon = [
    { x: topSeg.xStart, y: topSeg.y },
    { x: topSeg.xEnd, y: topSeg.y },
    { x: rightSeg.x, y: rightSeg.yEnd },
    { x: rightSeg.x, y: rightSeg.yStart },
    { x: botSeg.xEnd, y: botSeg.y },
    { x: botSeg.xStart, y: botSeg.y },
    { x: leftSeg.x, y: leftSeg.yStart },
    { x: leftSeg.x, y: leftSeg.yEnd },
  ]

  // Remove consecutive duplicate points (happens when same via is extreme in multiple directions)
  return deduplicateConsecutivePoints(rawPolygon)
}

/**
 * Translate via positions by (dx, dy).
 */
function translateVias(
  vias: Array<{ viaId: string; diameter: number; position: Point }>,
  dx: number,
  dy: number,
  prefix: string,
): Array<{ viaId: string; diameter: number; position: Point }> {
  return vias.map((v) => ({
    viaId: `${prefix}:${v.viaId}`,
    diameter: v.diameter,
    position: {
      x: v.position.x + dx,
      y: v.position.y + dy,
    },
  }))
}

function translateRouteSegments(
  routeSegments: RouteSegment[],
  dx: number,
  dy: number,
  prefix: string,
): RouteSegment[] {
  return routeSegments.map((segment) => ({
    routeId: `${prefix}:${segment.routeId}`,
    fromPort: `${prefix}:${segment.fromPort}`,
    toPort: `${prefix}:${segment.toPort}`,
    layer: segment.layer,
    segments: segment.segments.map((point) => ({
      x: point.x + dx,
      y: point.y + dy,
    })),
  }))
}

/**
 * Generates a via topology using convex regions computed by ConvexRegionsSolver.
 *
 * 1. Via tiles are placed on a grid (5mm tiles by default)
 * 2. Per-net via region polygons are created within each tile
 * 3. Convex regions are computed globally with via region polygons as obstacles
 * 4. Ports are created between adjacent convex regions and between convex/via regions
 */
export function generateConvexViaTopologyRegions(opts: {
  viaTile: ViaTile
  bounds: Bounds
  tileSize?: number
  portPitch?: number
  clearance?: number
  concavityTolerance?: number
}): {
  regions: JRegion[]
  ports: JPort[]
  viaTile: ViaTile
  tileCount: { rows: number; cols: number }
} {
  const tileSize = opts.tileSize ?? DEFAULT_TILE_SIZE
  const portPitch = opts.portPitch ?? DEFAULT_PORT_PITCH
  const clearance = opts.clearance ?? DEFAULT_CLEARANCE
  const concavityTolerance = opts.concavityTolerance ?? 0
  const { bounds, viaTile: inputViaTile } = opts
  const { viasByNet, routeSegments } = inputViaTile

  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY

  const cols = Math.floor(width / tileSize)
  const rows = Math.floor(height / tileSize)

  const allRegions: JRegion[] = []
  const allPorts: JPort[] = []
  const viaTile: ViaTile = { viasByNet: {}, routeSegments: [] }
  const viaRegions: JRegion[] = []

  // Calculate tile grid position (centered within bounds)
  const gridWidth = cols * tileSize
  const gridHeight = rows * tileSize
  const gridMinX = bounds.minX + (width - gridWidth) / 2
  const gridMinY = bounds.minY + (height - gridHeight) / 2
  const half = tileSize / 2

  // Step 1: Generate tiled via regions
  if (rows > 0 && cols > 0) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tileCenterX = gridMinX + col * tileSize + half
        const tileCenterY = gridMinY + row * tileSize + half
        const prefix = `t${row}_${col}`

        // Create per-net via regions for this tile
        for (const [netName, vias] of Object.entries(viasByNet)) {
          if (vias.length === 0) continue

          // Translate vias to tile position
          const translatedVias = translateVias(
            vias,
            tileCenterX,
            tileCenterY,
            prefix,
          )

          // Add to output viaTile
          if (!viaTile.viasByNet[netName]) {
            viaTile.viasByNet[netName] = []
          }
          viaTile.viasByNet[netName].push(...translatedVias)

          // Generate via region polygon
          const polygon = generateViaRegionPolygon(translatedVias)
          if (polygon.length === 0) continue

          const viaRegion = createRegionFromPolygon(
            `${prefix}:v:${netName}`,
            polygon,
            { isViaRegion: true },
          )
          viaRegions.push(viaRegion)
          allRegions.push(viaRegion)
        }

        viaTile.routeSegments.push(
          ...translateRouteSegments(
            routeSegments,
            tileCenterX,
            tileCenterY,
            prefix,
          ),
        )
      }
    }
  }

  // Step 2: Compute convex regions using ConvexRegionsSolver
  // Via region polygons are used as obstacles
  const obstaclePolygons = viaRegions.map((r) => ({
    points: r.d.polygon!,
  }))

  const solverInput = {
    bounds,
    polygons: obstaclePolygons,
    clearance,
    concavityTolerance,
  } as ConstructorParameters<typeof ConvexRegionsSolver>[0]

  const solver = new ConvexRegionsSolver(solverInput)

  solver.solve()
  const solverOutput = solver.getOutput()

  if (!solverOutput) {
    throw new Error("ConvexRegionsSolver failed to compute regions")
  }

  // Step 3: Convert solver output to JRegions
  const convexRegions: JRegion[] = solverOutput.regions.map(
    (polygon: Point[], i: number) =>
      createRegionFromPolygon(`convex:${i}`, polygon),
  )
  allRegions.push(...convexRegions)

  // Step 4: Create ports between adjacent convex regions
  let portIdCounter = 0

  for (let i = 0; i < convexRegions.length; i++) {
    for (let j = i + 1; j < convexRegions.length; j++) {
      const region1 = convexRegions[i]
      const region2 = convexRegions[j]

      const sharedEdges = findSharedEdges(
        region1.d.polygon!,
        region2.d.polygon!,
        clearance * 2, // tolerance slightly larger than clearance
      )

      for (const edge of sharedEdges) {
        const portPositions = createPortsAlongEdge(edge, portPitch)

        for (const pos of portPositions) {
          const port: JPort = {
            portId: `convex:${i}-${j}:${portIdCounter++}`,
            region1,
            region2,
            d: { x: pos.x, y: pos.y },
          }
          region1.ports.push(port)
          region2.ports.push(port)
          allPorts.push(port)
        }
      }
    }
  }

  // Step 5: Create ports between convex regions and via regions
  // Restrict each via region to at most 4 ports (top/bottom/left/right).
  for (const viaRegion of viaRegions) {
    const viaCenter = viaRegion.d.center as Point
    const candidates: ViaPortCandidate[] = []

    for (const convexRegion of convexRegions) {
      const sharedEdges = findSharedEdges(
        viaRegion.d.polygon!,
        convexRegion.d.polygon!,
        clearance * 2,
      )

      for (const edge of sharedEdges) {
        const portPositions = createPortsAlongEdge(edge, portPitch)

        for (const pos of portPositions) {
          const dx = pos.x - viaCenter.x
          const dy = pos.y - viaCenter.y
          const side = classifySideFromBounds(pos, viaRegion.d.bounds)
          const primaryDistance =
            side === "left" || side === "right" ? Math.abs(dx) : Math.abs(dy)
          const orthDistance =
            side === "left" || side === "right" ? Math.abs(dy) : Math.abs(dx)

          candidates.push({
            convexRegion,
            position: pos,
            side,
            primaryDistance,
            orthDistance,
            key: toCandidateKey(convexRegion.regionId, pos),
          })
        }
      }
    }

    if (candidates.length === 0) continue

    const selectedCandidates: ViaPortCandidate[] = []
    const selectedKeys = new Set<string>()

    const addCandidate = (candidate: ViaPortCandidate | undefined): void => {
      if (!candidate) return
      if (selectedKeys.has(candidate.key)) return
      selectedCandidates.push(candidate)
      selectedKeys.add(candidate.key)
    }

    for (const side of ["top", "bottom", "left", "right"] as const) {
      const sideCandidate = [...candidates]
        .filter((candidate) => candidate.side === side)
        .sort(compareCandidateQuality)[0]
      addCandidate(sideCandidate)
    }

    if (selectedCandidates.length < 4) {
      for (const candidate of [...candidates].sort(compareCandidateQuality)) {
        addCandidate(candidate)
        if (selectedCandidates.length >= 4) break
      }
    }

    for (const selectedCandidate of selectedCandidates.slice(0, 4)) {
      const port: JPort = {
        portId: `via-convex:${viaRegion.regionId}-${selectedCandidate.convexRegion.regionId}:${portIdCounter++}`,
        region1: viaRegion,
        region2: selectedCandidate.convexRegion,
        d: {
          x: selectedCandidate.position.x,
          y: selectedCandidate.position.y,
        },
      }
      viaRegion.ports.push(port)
      selectedCandidate.convexRegion.ports.push(port)
      allPorts.push(port)
    }
  }

  return {
    regions: allRegions,
    ports: allPorts,
    viaTile,
    tileCount: { rows, cols },
  }
}
