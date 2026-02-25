import defaultViaTile from "assets/ViaGraphSolver/via-tile.json"
import type { XYConnection } from "../../JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import type { JumperGraph } from "../../JumperGraphSolver/jumper-types"
import type { Connection } from "../../types"
import type { ViaTile } from "../ViaGraphSolver"
import { createViaGraphWithConnections } from "./createViaGraphWithConnections"
import { generateConvexViaTopologyRegions } from "./generateConvexViaTopologyRegions"

export type ConvexViaGraphFromXYConnectionsResult = JumperGraph & {
  connections: Connection[]
  viaTile: ViaTile
  tileCount: { rows: number; cols: number }
}

/**
 * Calculate the bounds from XY connections with no margin.
 * The bounds go edge-to-edge with the connection points.
 */
function calculateBoundsFromConnections(xyConnections: XYConnection[]): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} {
  if (xyConnections.length === 0) {
    throw new Error("Cannot calculate bounds from empty connections array")
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const conn of xyConnections) {
    minX = Math.min(minX, conn.start.x, conn.end.x)
    maxX = Math.max(maxX, conn.start.x, conn.end.x)
    minY = Math.min(minY, conn.start.y, conn.end.y)
    maxY = Math.max(maxY, conn.start.y, conn.end.y)
  }

  return { minX, maxX, minY, maxY }
}

/**
 * Creates a complete via topology graph from XY connections using convex regions.
 *
 * This function uses ConvexRegionsSolver to compute convex regions around
 * via region obstacles, instead of the manual T/B/L/R outer regions.
 *
 * It:
 * 1. Calculates bounds from connection XY coordinates (no margin)
 * 2. Generates per-net via region polygons on a tiled grid
 * 3. Uses ConvexRegionsSolver to compute convex regions around via regions
 * 4. Creates ports between adjacent convex regions and via regions
 * 5. Attaches connection regions to the graph
 *
 * @param xyConnections - Array of connections with start/end XY coordinates
 * @param viaTile - Via tile data (defaults to built-in via-tile.json)
 * @param opts - Optional configuration
 */
export function createConvexViaGraphFromXYConnections(
  xyConnections: XYConnection[],
  viaTile: ViaTile = defaultViaTile as ViaTile,
  opts?: {
    tileSize?: number
    portPitch?: number
    clearance?: number
    concavityTolerance?: number
  },
): ConvexViaGraphFromXYConnectionsResult {
  // Calculate bounds from connections (no margin)
  const bounds = calculateBoundsFromConnections(xyConnections)

  // Generate the via topology with convex regions
  const {
    regions,
    ports,
    viaTile: generatedViaTile,
    tileCount,
  } = generateConvexViaTopologyRegions({
    viaTile,
    bounds,
    tileSize: opts?.tileSize,
    portPitch: opts?.portPitch,
    clearance: opts?.clearance,
    concavityTolerance: opts?.concavityTolerance,
  })

  // Create base graph from regions
  const baseGraph: JumperGraph = { regions, ports }

  // Add connections to the graph
  const graphWithConnections = createViaGraphWithConnections(
    baseGraph,
    xyConnections,
  )

  return {
    ...graphWithConnections,
    viaTile: generatedViaTile,
    tileCount,
  }
}
