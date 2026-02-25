import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { createConnectionPort } from "lib/JumperGraphSolver/jumper-graph-generator/createConnectionPort"
import { createConnectionRegion } from "lib/JumperGraphSolver/jumper-graph-generator/createConnectionRegion"
import type {
  JPort,
  JRegion,
  JumperGraph,
} from "lib/JumperGraphSolver/jumper-types"
import type { Connection } from "lib/types"
import type { ViaByNet, ViaTile } from "lib/ViaGraphSolver/ViaGraphSolver"
import { ViaGraphSolver } from "lib/ViaGraphSolver/ViaGraphSolver"
import { findBoundaryRegionForPolygons } from "lib/ViaGraphSolver/via-graph-generator/findBoundaryRegionForPolygons"
import { generateViaTopologyRegions } from "lib/ViaGraphSolver/via-graph-generator/generateViaTopologyRegions"
import viaTile from "assets/ViaGraphSolver/via-tile.json"

// ── Configuration ──────────────────────────────────────────────────────
const TILE_SIZE = 5
const COLS = 4
const ROWS = 4
const TRACE_PITCH = 0.4

// ── Helper: translate a via topology graph by (dx, dy) with new ID prefix ──
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

// ── Helper: create evenly-spaced ports along a shared boundary ──────────
function createBoundaryPorts(
  portIdPrefix: string,
  region1: JRegion,
  region2: JRegion,
  axis: "horizontal" | "vertical",
  fixedCoord: number,
  start: number,
  end: number,
): JPort[] {
  const length = Math.abs(end - start)
  const count = Math.max(1, Math.floor(length / TRACE_PITCH))
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

// ── Step 1: Generate the base via topology (centered at origin) ────────
const baseGraph = generateViaTopologyRegions(viaTile, {
  graphSize: TILE_SIZE,
  idPrefix: "v",
})

// ── Step 2: Tile the via topologies in a 4×4 grid ──────────────────────
// Grid origin at (0,0) for tile (0,0). Each tile offset by TILE_SIZE.
// Total graph spans from (0, 0) to (COLS*TILE_SIZE, ROWS*TILE_SIZE)
// But since baseGraph is centered at 0, we offset each tile center:
//   tile (col, row) center = (col * TILE_SIZE, row * TILE_SIZE)
// So tile (0,0) spans [-2.5, 2.5], tile (1,0) spans [2.5, 7.5], etc.

const allRegions: JRegion[] = []
const allPorts: JPort[] = []
const tileGraphs: JumperGraph[][] = [] // [row][col]

for (let row = 0; row < ROWS; row++) {
  tileGraphs[row] = []
  for (let col = 0; col < COLS; col++) {
    const dx = col * TILE_SIZE
    const dy = row * TILE_SIZE
    const prefix = `t${row}_${col}`
    const tile = translateGraph(baseGraph, dx, dy, prefix)
    tileGraphs[row][col] = tile
    allRegions.push(...tile.regions)
    allPorts.push(...tile.ports)
  }
}

// ── Step 3: Add cross-tile ports between adjacent tiles ────────────────
// Adjacent tiles share a boundary. The outer regions (T, B, L, R) each
// cover only part of the tile edge, so we compute the exact polygon
// segments on each edge and create ports only in the overlapping ranges.

function findRegion(graph: JumperGraph, suffix: string): JRegion {
  const region = graph.regions.find((r) => r.regionId.endsWith(`:v:${suffix}`))
  if (!region) throw new Error(`Region with suffix ${suffix} not found`)
  return region
}

/** Return the range(s) along the varying axis where a polygon touches a boundary. */
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

/** Compute the intersection of two 1D ranges, or null if they don't overlap. */
function rangeOverlap(
  a: { from: number; to: number },
  b: { from: number; to: number },
): { from: number; to: number } | null {
  const from = Math.max(a.from, b.from)
  const to = Math.min(a.to, b.to)
  if (to - from < 0.001) return null
  return { from, to }
}

// Pre-compute the base graph's boundary segments (before any translation).
// These are the same for every tile — we just add the tile offset later.
const half = TILE_SIZE / 2
const outerIds = ["T", "B", "L", "R"] as const
type EdgeName = "right" | "left" | "top" | "bottom"

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

// For horizontal neighbors (col, col+1) at boundary x:
//   Left tile's regions on its right edge pair with right tile's regions
//   on its left edge. The region pairs that can share a boundary segment:
//     T(left, right edge) ↔ T(right, left edge)
//     R(left, right edge) ↔ L(right, left edge)
//     B(left, right edge) ↔ B(right, left edge)
const hPairs: {
  leftRegionId: (typeof outerIds)[number]
  leftEdge: EdgeName
  rightRegionId: (typeof outerIds)[number]
  rightEdge: EdgeName
}[] = [
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
]

for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS - 1; col++) {
    const leftTile = tileGraphs[row][col]
    const rightTile = tileGraphs[row][col + 1]
    const boundaryX = col * TILE_SIZE + half
    const yOffset = row * TILE_SIZE

    for (const pair of hPairs) {
      const leftSegs = baseBoundarySegs[pair.leftRegionId][pair.leftEdge]
      const rightSegs = baseBoundarySegs[pair.rightRegionId][pair.rightEdge]

      for (const ls of leftSegs) {
        for (const rs of rightSegs) {
          const overlap = rangeOverlap(ls, rs)
          if (!overlap) continue

          const r1 = findRegion(leftTile, pair.leftRegionId)
          const r2 = findRegion(rightTile, pair.rightRegionId)
          const tag = `${pair.leftRegionId}${pair.rightRegionId}`
          const ports = createBoundaryPorts(
            `cross:h:${row}_${col}:${tag}`,
            r1,
            r2,
            "vertical",
            boundaryX,
            overlap.from + yOffset,
            overlap.to + yOffset,
          )
          allPorts.push(...ports)
        }
      }
    }
  }
}

// For vertical neighbors (row, row+1) at boundary y:
//   Bottom tile's regions on its top edge pair with top tile's regions
//   on its bottom edge. The region pairs:
//     T(bottom, top edge) ↔ B(top, bottom edge)
//     L(bottom, top edge) ↔ L(top, bottom edge)
//     R(bottom, top edge) ↔ R(top, bottom edge)
const vPairs: {
  bottomRegionId: (typeof outerIds)[number]
  bottomEdge: EdgeName
  topRegionId: (typeof outerIds)[number]
  topEdge: EdgeName
}[] = [
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
]

for (let row = 0; row < ROWS - 1; row++) {
  for (let col = 0; col < COLS; col++) {
    const bottomTile = tileGraphs[row][col]
    const topTile = tileGraphs[row + 1][col]
    const boundaryY = row * TILE_SIZE + half
    const xOffset = col * TILE_SIZE

    for (const pair of vPairs) {
      const bottomSegs = baseBoundarySegs[pair.bottomRegionId][pair.bottomEdge]
      const topSegs = baseBoundarySegs[pair.topRegionId][pair.topEdge]

      for (const bs of bottomSegs) {
        for (const ts of topSegs) {
          const overlap = rangeOverlap(bs, ts)
          if (!overlap) continue

          const r1 = findRegion(bottomTile, pair.bottomRegionId)
          const r2 = findRegion(topTile, pair.topRegionId)
          const tag = `${pair.bottomRegionId}${pair.topRegionId}`
          const ports = createBoundaryPorts(
            `cross:v:${row}_${col}:${tag}`,
            r1,
            r2,
            "horizontal",
            boundaryY,
            overlap.from + xOffset,
            overlap.to + xOffset,
          )
          allPorts.push(...ports)
        }
      }
    }
  }
}

// ── Step 4: Place 13 connections on the combined graph boundary ────────
// Combined graph spans:
//   X: [-TILE_SIZE/2, (COLS-1)*TILE_SIZE + TILE_SIZE/2] = [-2.5, 17.5]
//   Y: [-TILE_SIZE/2, (ROWS-1)*TILE_SIZE + TILE_SIZE/2] = [-2.5, 17.5]
const graphMinX = -TILE_SIZE / 2
const graphMaxX = (COLS - 1) * TILE_SIZE + TILE_SIZE / 2
const graphMinY = -TILE_SIZE / 2
const graphMaxY = (ROWS - 1) * TILE_SIZE + TILE_SIZE / 2

// Place connections along the edges — matching the 13 connections from fixture05.
// Distribute start/end positions along the 4 edges of the 20×20 graph.
const connections: Array<{
  start: { x: number; y: number }
  end: { x: number; y: number }
  connectionId: string
}> = [
  // Left edge → bottom edge
  {
    start: { x: graphMinX, y: 14.5 },
    end: { x: 10.0, y: graphMinY },
    connectionId: "source_net_1_mst2",
  },
  // Bottom edge → left edge
  {
    start: { x: 5.0, y: graphMinY },
    end: { x: graphMinX, y: 7.5 },
    connectionId: "source_net_6",
  },
  // Bottom edge → left edge
  {
    start: { x: 2.5, y: graphMinY },
    end: { x: graphMinX, y: 5.0 },
    connectionId: "source_net_5",
  },
  // Bottom edge → left edge
  {
    start: { x: 0.0, y: graphMinY },
    end: { x: graphMinX, y: 2.5 },
    connectionId: "source_net_4",
  },
  // Left edge → left edge (vertical)
  {
    start: { x: graphMinX, y: 15.5 },
    end: { x: graphMinX, y: 10.0 },
    connectionId: "source_net_1_mst0",
  },
  // Bottom edge → left edge
  {
    start: { x: 7.5, y: graphMinY },
    end: { x: graphMinX, y: 6.0 },
    connectionId: "source_net_7",
  },
  // Bottom edge → left edge
  {
    start: { x: 9.0, y: graphMinY },
    end: { x: graphMinX, y: 12.5 },
    connectionId: "source_net_9",
  },
  // Left edge → bottom edge
  {
    start: { x: graphMinX, y: 8.5 },
    end: { x: 12.5, y: graphMinY },
    connectionId: "source_net_2_mst2",
  },
  // Bottom edge → right edge
  {
    start: { x: -1.0, y: graphMinY },
    end: { x: graphMaxX, y: 0.0 },
    connectionId: "source_net_0_mst15",
  },
  // Left edge → bottom edge
  {
    start: { x: graphMinX, y: 7.0 },
    end: { x: 15.0, y: graphMinY },
    connectionId: "source_net_3_mst2",
  },
  // Left edge → left edge (vertical)
  {
    start: { x: graphMinX, y: 11.0 },
    end: { x: graphMinX, y: 16.0 },
    connectionId: "source_net_2_mst0",
  },
  // Left edge → right edge (diagonal)
  {
    start: { x: graphMinX, y: 16.5 },
    end: { x: graphMaxX, y: 10.0 },
    connectionId: "source_net_3_mst1",
  },
  // Bottom edge → bottom edge
  {
    start: { x: 4.0, y: graphMinY },
    end: { x: 13.0, y: graphMinY },
    connectionId: "source_net_2_mst1",
  },
]

// ── Step 5: Add connection regions and ports ───────────────────────────
const allConnections: Connection[] = []

for (const xyConn of connections) {
  const { start, end, connectionId } = xyConn

  const startRegion = createConnectionRegion(
    `conn:${connectionId}:start`,
    start.x,
    start.y,
  )
  allRegions.push(startRegion)

  const endRegion = createConnectionRegion(
    `conn:${connectionId}:end`,
    end.x,
    end.y,
  )
  allRegions.push(endRegion)

  // Find the nearest boundary region for each endpoint
  const startBoundary = findBoundaryRegionForPolygons(
    start.x,
    start.y,
    allRegions,
  )
  if (startBoundary) {
    const startPort = createConnectionPort(
      `conn:${connectionId}:start-port`,
      startRegion,
      startBoundary.region,
      startBoundary.portPosition,
    )
    allPorts.push(startPort)
  }

  const endBoundary = findBoundaryRegionForPolygons(end.x, end.y, allRegions)
  if (endBoundary) {
    const endPort = createConnectionPort(
      `conn:${connectionId}:end-port`,
      endRegion,
      endBoundary.region,
      endBoundary.portPosition,
    )
    allPorts.push(endPort)
  }

  allConnections.push({
    connectionId,
    mutuallyConnectedNetworkId: connectionId,
    startRegion,
    endRegion,
  })
}

// ── Step 6: Build expanded vias with positions for every tile ──────
// The visualizer draws via circles from viaTile positions directly.
// The original data is centered at the origin, so we duplicate each via
// for every tile offset so circles appear in all 16 tiles.
const expandedViasByNet: ViaByNet = {}
for (const [netName, vias] of Object.entries(viaTile.viasByNet)) {
  const allVias: {
    viaId: string
    diameter: number
    position: { x: number; y: number }
  }[] = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const dx = col * TILE_SIZE
      const dy = row * TILE_SIZE
      for (const via of vias) {
        allVias.push({
          viaId: `t${row}_${col}:${via.viaId}`,
          diameter: via.diameter,
          position: {
            x: via.position.x + dx,
            y: via.position.y + dy,
          },
        })
      }
    }
  }
  expandedViasByNet[netName] = allVias
}

// ── Render ──────────────────────────────────────────────────────────────
export default () => (
  <GenericSolverDebugger
    createSolver={() =>
      new ViaGraphSolver({
        inputGraph: {
          regions: allRegions,
          ports: allPorts,
        },
        inputConnections: allConnections,
        viaTile: {
          viasByNet: expandedViasByNet,
          routeSegments: [],
        } as ViaTile,
      })
    }
  />
)
