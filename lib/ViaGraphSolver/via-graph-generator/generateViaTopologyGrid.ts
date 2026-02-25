import type {
  JPort,
  JRegion,
  JumperGraph,
} from "../../JumperGraphSolver/jumper-types"
import type { RouteSegment, ViaTile } from "../ViaGraphSolver"
import { generateViaTopologyRegions } from "./generateViaTopologyRegions"

/**
 * Default port pitch (mm) for distributing ports along shared boundaries.
 */
const DEFAULT_PORT_PITCH = 0.4

/**
 * Default tile size (mm) for via topology tiles.
 */
const DEFAULT_TILE_SIZE = 5

type Bounds = { minX: number; maxX: number; minY: number; maxY: number }

/**
 * Translate a via topology graph by (dx, dy) with a new ID prefix.
 */
function translateGraph(
  graph: JumperGraph,
  dx: number,
  dy: number,
  prefix: string,
): JumperGraph {
  const regionMap = new Map<JRegion, JRegion>()

  const regions = graph.regions.map((r): JRegion => {
    const newRegion: JRegion = {
      regionId: `${prefix}:${r.regionId}`,
      ports: [],
      d: {
        bounds: {
          minX: r.d.bounds.minX + dx,
          maxX: r.d.bounds.maxX + dx,
          minY: r.d.bounds.minY + dy,
          maxY: r.d.bounds.maxY + dy,
        },
        center: {
          x: r.d.center.x + dx,
          y: r.d.center.y + dy,
        },
        polygon: r.d.polygon?.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        isPad: r.d.isPad,
        isThroughJumper: r.d.isThroughJumper,
        isConnectionRegion: r.d.isConnectionRegion,
        isViaRegion: r.d.isViaRegion,
      },
    }
    regionMap.set(r, newRegion)
    return newRegion
  })

  const ports = graph.ports.map((p): JPort => {
    const newPort: JPort = {
      portId: `${prefix}:${p.portId}`,
      region1: regionMap.get(p.region1 as JRegion)!,
      region2: regionMap.get(p.region2 as JRegion)!,
      d: { x: p.d.x + dx, y: p.d.y + dy },
    }
    newPort.region1.ports.push(newPort)
    newPort.region2.ports.push(newPort)
    return newPort
  })

  return { regions, ports }
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
 * Create evenly-spaced ports along a shared boundary segment.
 */
function createBoundaryPorts(
  portIdPrefix: string,
  region1: JRegion,
  region2: JRegion,
  axis: "horizontal" | "vertical",
  fixedCoord: number,
  start: number,
  end: number,
  portPitch: number,
): JPort[] {
  const length = Math.abs(end - start)
  if (length < 0.001) return [] // Skip zero-length boundaries
  const count = Math.max(1, Math.floor(length / portPitch))
  const min = Math.min(start, end)
  const ports: JPort[] = []

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const varying = min + t * length
    const x = axis === "horizontal" ? varying : fixedCoord
    const y = axis === "horizontal" ? fixedCoord : varying
    const portId = count === 1 ? portIdPrefix : `${portIdPrefix}_${i}`

    const port: JPort = {
      portId,
      region1,
      region2,
      d: { x, y },
    }
    region1.ports.push(port)
    region2.ports.push(port)
    ports.push(port)
  }

  return ports
}

/**
 * Create a rectangular region with polygon data.
 */
function createRectRegion(
  regionId: string,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): JRegion {
  const polygon = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]
  return {
    regionId,
    ports: [],
    d: {
      bounds: { minX, maxX, minY, maxY },
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
      polygon,
      isPad: false,
    },
  }
}

/**
 * Find a region in a graph by its ID suffix (after the tile prefix).
 */
function findRegionBySuffix(graph: JumperGraph, suffix: string): JRegion {
  const region = graph.regions.find((r) => r.regionId.endsWith(`:${suffix}`))
  if (!region) throw new Error(`Region with suffix ${suffix} not found`)
  return region
}

/**
 * Return the range(s) along the varying axis where a polygon touches a boundary.
 */
function getBoundarySegments(
  polygon: { x: number; y: number }[],
  edge: "right" | "left" | "top" | "bottom",
  boundaryCoord: number,
): { from: number; to: number }[] {
  const eps = 0.001
  const segments: { from: number; to: number }[] = []

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]

    const isVerticalEdge = edge === "right" || edge === "left"
    if (isVerticalEdge) {
      if (
        Math.abs(a.x - boundaryCoord) < eps &&
        Math.abs(b.x - boundaryCoord) < eps
      ) {
        segments.push({ from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) })
      }
    } else {
      if (
        Math.abs(a.y - boundaryCoord) < eps &&
        Math.abs(b.y - boundaryCoord) < eps
      ) {
        segments.push({ from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) })
      }
    }
  }

  return segments
}

/**
 * Compute the intersection of two 1D ranges, or null if they don't overlap.
 */
function rangeOverlap(
  a: { from: number; to: number },
  b: { from: number; to: number },
): { from: number; to: number } | null {
  const from = Math.max(a.from, b.from)
  const to = Math.min(a.to, b.to)
  if (to - from < 0.001) return null
  return { from, to }
}

type EdgeName = "right" | "left" | "top" | "bottom"

/**
 * Generates a tiled grid of via topologies with outer frame regions.
 *
 * The via tiles are centered within the given bounds. If the bounds are smaller
 * than one tile, no via tiles are created - only outer frame regions.
 *
 * The outer frame consists of rectangular regions (T, B, L, R) that fill the
 * space between the tiled area and the problem bounds.
 */
export function generateViaTopologyGrid(opts: {
  viaTile: ViaTile
  bounds: Bounds
  tileSize?: number
  portPitch?: number
}): {
  regions: JRegion[]
  ports: JPort[]
  viaTile: ViaTile
  tileCount: { rows: number; cols: number }
} {
  const tileSize = opts.tileSize ?? DEFAULT_TILE_SIZE
  const portPitch = opts.portPitch ?? DEFAULT_PORT_PITCH
  const { bounds, viaTile: inputViaTile } = opts
  const { viasByNet, routeSegments } = inputViaTile

  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY

  const cols = Math.floor(width / tileSize)
  const rows = Math.floor(height / tileSize)

  const allRegions: JRegion[] = []
  const allPorts: JPort[] = []
  const viaTile: ViaTile = { viasByNet: {}, routeSegments: [] }

  // Calculate tile grid position (centered within bounds)
  const gridWidth = cols * tileSize
  const gridHeight = rows * tileSize
  const gridMinX = bounds.minX + (width - gridWidth) / 2
  const gridMinY = bounds.minY + (height - gridHeight) / 2
  const gridMaxX = gridMinX + gridWidth
  const gridMaxY = gridMinY + gridHeight

  // Track tile graphs for cross-tile port creation
  const tileGraphs: JumperGraph[][] = []

  if (rows > 0 && cols > 0) {
    // Generate base via topology (centered at origin)
    const baseGraph = generateViaTopologyRegions(inputViaTile, {
      graphSize: tileSize,
      idPrefix: "v",
    })

    const half = tileSize / 2

    // Pre-compute base graph's boundary segments for cross-tile connections
    const outerIds = ["T", "B", "L", "R"] as const
    const baseBoundarySegs: Record<
      string,
      Record<EdgeName, { from: number; to: number }[]>
    > = {}
    for (const id of outerIds) {
      const r = baseGraph.regions.find((r) => r.regionId === `v:${id}`)!
      baseBoundarySegs[id] = {
        right: getBoundarySegments(r.d.polygon!, "right", half),
        left: getBoundarySegments(r.d.polygon!, "left", -half),
        top: getBoundarySegments(r.d.polygon!, "top", half),
        bottom: getBoundarySegments(r.d.polygon!, "bottom", -half),
      }
    }

    // Create tiled via topologies
    for (let row = 0; row < rows; row++) {
      tileGraphs[row] = []
      for (let col = 0; col < cols; col++) {
        // Tile center position
        const tileCenterX = gridMinX + col * tileSize + half
        const tileCenterY = gridMinY + row * tileSize + half
        const prefix = `t${row}_${col}`

        const tile = translateGraph(baseGraph, tileCenterX, tileCenterY, prefix)
        tileGraphs[row][col] = tile
        allRegions.push(...tile.regions)
        allPorts.push(...tile.ports)

        // Add translated vias to viaTile output
        for (const [netName, vias] of Object.entries(viasByNet)) {
          if (!viaTile.viasByNet[netName]) {
            viaTile.viasByNet[netName] = []
          }
          for (const via of vias) {
            viaTile.viasByNet[netName].push({
              viaId: `${prefix}:${via.viaId}`,
              diameter: via.diameter,
              position: {
                x: via.position.x + tileCenterX,
                y: via.position.y + tileCenterY,
              },
            })
          }
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

    // Create cross-tile ports between horizontally adjacent tiles
    const hPairs = [
      {
        leftRegionId: "T",
        leftEdge: "right",
        rightRegionId: "T",
        rightEdge: "left",
      },
      {
        leftRegionId: "R",
        leftEdge: "right",
        rightRegionId: "L",
        rightEdge: "left",
      },
      {
        leftRegionId: "B",
        leftEdge: "right",
        rightRegionId: "B",
        rightEdge: "left",
      },
    ] as const

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols - 1; col++) {
        const leftTile = tileGraphs[row][col]
        const rightTile = tileGraphs[row][col + 1]
        const boundaryX = gridMinX + (col + 1) * tileSize
        const yOffset = gridMinY + row * tileSize + half

        for (const pair of hPairs) {
          const leftSegs = baseBoundarySegs[pair.leftRegionId][pair.leftEdge]
          const rightSegs = baseBoundarySegs[pair.rightRegionId][pair.rightEdge]

          for (const ls of leftSegs) {
            for (const rs of rightSegs) {
              const overlap = rangeOverlap(ls, rs)
              if (!overlap) continue

              const r1 = findRegionBySuffix(leftTile, `v:${pair.leftRegionId}`)
              const r2 = findRegionBySuffix(
                rightTile,
                `v:${pair.rightRegionId}`,
              )
              const tag = `${pair.leftRegionId}${pair.rightRegionId}`
              const ports = createBoundaryPorts(
                `cross:h:${row}_${col}:${tag}`,
                r1,
                r2,
                "vertical",
                boundaryX,
                overlap.from + yOffset,
                overlap.to + yOffset,
                portPitch,
              )
              allPorts.push(...ports)
            }
          }
        }
      }
    }

    // Create cross-tile ports between vertically adjacent tiles
    const vPairs = [
      {
        bottomRegionId: "T",
        bottomEdge: "top",
        topRegionId: "B",
        topEdge: "bottom",
      },
      {
        bottomRegionId: "L",
        bottomEdge: "top",
        topRegionId: "L",
        topEdge: "bottom",
      },
      {
        bottomRegionId: "R",
        bottomEdge: "top",
        topRegionId: "R",
        topEdge: "bottom",
      },
    ] as const

    for (let row = 0; row < rows - 1; row++) {
      for (let col = 0; col < cols; col++) {
        const bottomTile = tileGraphs[row][col]
        const topTile = tileGraphs[row + 1][col]
        const boundaryY = gridMinY + (row + 1) * tileSize
        const xOffset = gridMinX + col * tileSize + half

        for (const pair of vPairs) {
          const bottomSegs =
            baseBoundarySegs[pair.bottomRegionId][pair.bottomEdge]
          const topSegs = baseBoundarySegs[pair.topRegionId][pair.topEdge]

          for (const bs of bottomSegs) {
            for (const ts of topSegs) {
              const overlap = rangeOverlap(bs, ts)
              if (!overlap) continue

              const r1 = findRegionBySuffix(
                bottomTile,
                `v:${pair.bottomRegionId}`,
              )
              const r2 = findRegionBySuffix(topTile, `v:${pair.topRegionId}`)
              const tag = `${pair.bottomRegionId}${pair.topRegionId}`
              const ports = createBoundaryPorts(
                `cross:v:${row}_${col}:${tag}`,
                r1,
                r2,
                "horizontal",
                boundaryY,
                overlap.from + xOffset,
                overlap.to + xOffset,
                portPitch,
              )
              allPorts.push(...ports)
            }
          }
        }
      }
    }
  }

  // Create outer frame regions (T, B, L, R rectangles)
  // These fill the space between the tile grid and the problem bounds
  //
  // Layout: L and R span full height (bounds.minY to bounds.maxY) and cover corners
  //         T and B are shrunk to only cover grid width (frameMinX to frameMaxX)
  //         This ensures all ports between T/B and L/R are within both polygons' bounds
  //         and crossing detection works correctly
  const hasTopGap = bounds.maxY > gridMaxY || rows === 0
  const hasBottomGap = bounds.minY < gridMinY || rows === 0
  const hasLeftGap = bounds.minX < gridMinX || cols === 0
  const hasRightGap = bounds.maxX > gridMaxX || cols === 0

  let outerTop: JRegion | null = null
  let outerBottom: JRegion | null = null
  let outerLeft: JRegion | null = null
  let outerRight: JRegion | null = null

  // When no tiles exist, the outer frame covers the entire bounds
  const frameMinX = cols > 0 ? gridMinX : bounds.minX
  const frameMaxX = cols > 0 ? gridMaxX : bounds.maxX
  const frameMinY = rows > 0 ? gridMinY : bounds.minY
  const frameMaxY = rows > 0 ? gridMaxY : bounds.maxY

  // L and R span full height (bounds.minY to bounds.maxY) including corners
  if (hasLeftGap && bounds.minX < frameMinX) {
    outerLeft = createRectRegion(
      "outer:L",
      bounds.minX,
      frameMinX,
      bounds.minY,
      bounds.maxY,
    )
    allRegions.push(outerLeft)
  }

  if (hasRightGap && bounds.maxX > frameMaxX) {
    outerRight = createRectRegion(
      "outer:R",
      frameMaxX,
      bounds.maxX,
      bounds.minY,
      bounds.maxY,
    )
    allRegions.push(outerRight)
  }

  // T and B span grid width only (frameMinX to frameMaxX), not including corners
  // This ensures they don't overlap with L/R at corners
  if (hasTopGap && bounds.maxY > frameMaxY) {
    outerTop = createRectRegion(
      "outer:T",
      frameMinX,
      frameMaxX,
      frameMaxY,
      bounds.maxY,
    )
    allRegions.push(outerTop)
  }

  if (hasBottomGap && bounds.minY < frameMinY) {
    outerBottom = createRectRegion(
      "outer:B",
      frameMinX,
      frameMaxX,
      bounds.minY,
      frameMinY,
    )
    allRegions.push(outerBottom)
  }

  // Connect outer frame regions to each other at shared edges
  // T shares vertical edge with L at x=frameMinX, from y=frameMaxY to y=bounds.maxY
  // T shares vertical edge with R at x=frameMaxX, from y=frameMaxY to y=bounds.maxY
  // B shares vertical edge with L at x=frameMinX, from y=bounds.minY to y=frameMinY
  // B shares vertical edge with R at x=frameMaxX, from y=bounds.minY to y=frameMinY
  if (outerTop && outerLeft) {
    allPorts.push(
      ...createBoundaryPorts(
        "outer:T-L",
        outerTop,
        outerLeft,
        "vertical",
        frameMinX,
        frameMaxY,
        bounds.maxY,
        portPitch,
      ),
    )
  }
  if (outerTop && outerRight) {
    allPorts.push(
      ...createBoundaryPorts(
        "outer:T-R",
        outerTop,
        outerRight,
        "vertical",
        frameMaxX,
        frameMaxY,
        bounds.maxY,
        portPitch,
      ),
    )
  }
  if (outerBottom && outerLeft) {
    allPorts.push(
      ...createBoundaryPorts(
        "outer:B-L",
        outerBottom,
        outerLeft,
        "vertical",
        frameMinX,
        bounds.minY,
        frameMinY,
        portPitch,
      ),
    )
  }
  if (outerBottom && outerRight) {
    allPorts.push(
      ...createBoundaryPorts(
        "outer:B-R",
        outerBottom,
        outerRight,
        "vertical",
        frameMaxX,
        bounds.minY,
        frameMinY,
        portPitch,
      ),
    )
  }

  // Connect outer frame to tile edges (if tiles exist)
  if (rows > 0 && cols > 0) {
    const half = tileSize / 2

    // Connect outer top to top row tiles' T regions
    if (outerTop) {
      for (let col = 0; col < cols; col++) {
        const tile = tileGraphs[rows - 1][col]
        const tileT = findRegionBySuffix(tile, "v:T")

        // Find where the tile's T region touches its top boundary
        const baseT = generateViaTopologyRegions(inputViaTile, {
          graphSize: tileSize,
          idPrefix: "v",
        }).regions.find((r) => r.regionId === "v:T")!
        const topSegs = getBoundarySegments(baseT.d.polygon!, "top", half)

        for (const seg of topSegs) {
          const tileCenterX = gridMinX + col * tileSize + half
          allPorts.push(
            ...createBoundaryPorts(
              `outer:T-tile${col}`,
              outerTop,
              tileT,
              "horizontal",
              gridMaxY,
              seg.from + tileCenterX,
              seg.to + tileCenterX,
              portPitch,
            ),
          )
        }
      }
    }

    // Connect outer bottom to bottom row tiles' B regions
    if (outerBottom) {
      for (let col = 0; col < cols; col++) {
        const tile = tileGraphs[0][col]
        const tileB = findRegionBySuffix(tile, "v:B")

        const baseB = generateViaTopologyRegions(inputViaTile, {
          graphSize: tileSize,
          idPrefix: "v",
        }).regions.find((r) => r.regionId === "v:B")!
        const bottomSegs = getBoundarySegments(
          baseB.d.polygon!,
          "bottom",
          -half,
        )

        for (const seg of bottomSegs) {
          const tileCenterX = gridMinX + col * tileSize + half
          allPorts.push(
            ...createBoundaryPorts(
              `outer:B-tile${col}`,
              outerBottom,
              tileB,
              "horizontal",
              gridMinY,
              seg.from + tileCenterX,
              seg.to + tileCenterX,
              portPitch,
            ),
          )
        }
      }
    }

    // Connect outer left to left column tiles' L regions
    if (outerLeft) {
      for (let row = 0; row < rows; row++) {
        const tile = tileGraphs[row][0]
        const tileL = findRegionBySuffix(tile, "v:L")

        const baseL = generateViaTopologyRegions(inputViaTile, {
          graphSize: tileSize,
          idPrefix: "v",
        }).regions.find((r) => r.regionId === "v:L")!
        const leftSegs = getBoundarySegments(baseL.d.polygon!, "left", -half)

        for (const seg of leftSegs) {
          const tileCenterY = gridMinY + row * tileSize + half
          allPorts.push(
            ...createBoundaryPorts(
              `outer:L-tile${row}`,
              outerLeft,
              tileL,
              "vertical",
              gridMinX,
              seg.from + tileCenterY,
              seg.to + tileCenterY,
              portPitch,
            ),
          )
        }
      }
    }

    // Connect outer right to right column tiles' R regions
    if (outerRight) {
      for (let row = 0; row < rows; row++) {
        const tile = tileGraphs[row][cols - 1]
        const tileR = findRegionBySuffix(tile, "v:R")

        const baseR = generateViaTopologyRegions(inputViaTile, {
          graphSize: tileSize,
          idPrefix: "v",
        }).regions.find((r) => r.regionId === "v:R")!
        const rightSegs = getBoundarySegments(baseR.d.polygon!, "right", half)

        for (const seg of rightSegs) {
          const tileCenterY = gridMinY + row * tileSize + half
          allPorts.push(
            ...createBoundaryPorts(
              `outer:R-tile${row}`,
              outerRight,
              tileR,
              "vertical",
              gridMaxX,
              seg.from + tileCenterY,
              seg.to + tileCenterY,
              portPitch,
            ),
          )
        }
      }
    }

    // Connect outer left to left column tiles' T and B regions (corner connections)
    // These T/B regions extend to the left grid boundary and should connect to outer:L
    if (outerLeft) {
      const baseGraph = generateViaTopologyRegions(inputViaTile, {
        graphSize: tileSize,
        idPrefix: "v",
      })
      const baseT = baseGraph.regions.find((r) => r.regionId === "v:T")!
      const baseB = baseGraph.regions.find((r) => r.regionId === "v:B")!

      // T regions touch left boundary at x = -half
      const tLeftSegs = getBoundarySegments(baseT.d.polygon!, "left", -half)
      // B regions touch left boundary at x = -half
      const bLeftSegs = getBoundarySegments(baseB.d.polygon!, "left", -half)

      for (let row = 0; row < rows; row++) {
        const tile = tileGraphs[row][0]
        const tileT = findRegionBySuffix(tile, "v:T")
        const tileB = findRegionBySuffix(tile, "v:B")
        const tileCenterY = gridMinY + row * tileSize + half

        for (const seg of tLeftSegs) {
          allPorts.push(
            ...createBoundaryPorts(
              `outer:L-tileT${row}`,
              outerLeft,
              tileT,
              "vertical",
              gridMinX,
              seg.from + tileCenterY,
              seg.to + tileCenterY,
              portPitch,
            ),
          )
        }

        for (const seg of bLeftSegs) {
          allPorts.push(
            ...createBoundaryPorts(
              `outer:L-tileB${row}`,
              outerLeft,
              tileB,
              "vertical",
              gridMinX,
              seg.from + tileCenterY,
              seg.to + tileCenterY,
              portPitch,
            ),
          )
        }
      }
    }

    // Connect outer right to right column tiles' T and B regions (corner connections)
    // These T/B regions extend to the right grid boundary and should connect to outer:R
    if (outerRight) {
      const baseGraph = generateViaTopologyRegions(inputViaTile, {
        graphSize: tileSize,
        idPrefix: "v",
      })
      const baseT = baseGraph.regions.find((r) => r.regionId === "v:T")!
      const baseB = baseGraph.regions.find((r) => r.regionId === "v:B")!

      // T regions touch right boundary at x = half
      const tRightSegs = getBoundarySegments(baseT.d.polygon!, "right", half)
      // B regions touch right boundary at x = half
      const bRightSegs = getBoundarySegments(baseB.d.polygon!, "right", half)

      for (let row = 0; row < rows; row++) {
        const tile = tileGraphs[row][cols - 1]
        const tileT = findRegionBySuffix(tile, "v:T")
        const tileB = findRegionBySuffix(tile, "v:B")
        const tileCenterY = gridMinY + row * tileSize + half

        for (const seg of tRightSegs) {
          allPorts.push(
            ...createBoundaryPorts(
              `outer:R-tileT${row}`,
              outerRight,
              tileT,
              "vertical",
              gridMaxX,
              seg.from + tileCenterY,
              seg.to + tileCenterY,
              portPitch,
            ),
          )
        }

        for (const seg of bRightSegs) {
          allPorts.push(
            ...createBoundaryPorts(
              `outer:R-tileB${row}`,
              outerRight,
              tileB,
              "vertical",
              gridMaxX,
              seg.from + tileCenterY,
              seg.to + tileCenterY,
              portPitch,
            ),
          )
        }
      }
    }
  } else {
    // No tiles - connect outer frame regions to each other along shared edges
    // Top and Bottom share the full width
    if (outerTop && outerBottom) {
      // They don't share an edge directly (there's vertical space between)
    }
    // Left and Right share the full height (if no tiles)
    if (outerLeft && outerRight) {
      // They don't share an edge directly
    }
    // When there are no tiles, the outer frame regions meet at corners only
    // which is already handled above
  }

  return {
    regions: allRegions,
    ports: allPorts,
    viaTile,
    tileCount: { rows, cols },
  }
}
