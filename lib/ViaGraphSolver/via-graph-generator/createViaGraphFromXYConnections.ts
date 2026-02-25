import type { XYConnection } from "../../JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import type {
  JPort,
  JRegion,
  JumperGraph,
} from "../../JumperGraphSolver/jumper-types"
import type { Connection } from "../../types"
import type { ViaTile } from "../ViaGraphSolver"
import { createViaGraphWithConnections } from "./createViaGraphWithConnections"
import { generateViaTopologyGrid } from "./generateViaTopologyGrid"

export type ViaGraphFromXYConnectionsResult = JumperGraph & {
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
 * Creates a complete via topology graph from XY connections.
 *
 * This is the main entry point for integrating ViaGraphSolver with dataset02.
 * It:
 * 1. Calculates bounds from connection XY coordinates (no margin)
 * 2. Generates a tiled grid of via topologies that fits within bounds
 * 3. Creates outer frame regions to fill remaining space
 * 4. Attaches connection regions to the graph
 *
 * @param xyConnections - Array of connections with start/end XY coordinates
 * @param viaTile - Via tile data (vias grouped by net plus route segments)
 * @param opts - Optional configuration (tileSize defaults to 5mm, portPitch to 0.4mm)
 */
export function createViaGraphFromXYConnections(
  xyConnections: XYConnection[],
  viaTile: ViaTile,
  opts?: {
    tileSize?: number
    portPitch?: number
  },
): ViaGraphFromXYConnectionsResult {
  // Calculate bounds from connections (no margin)
  const bounds = calculateBoundsFromConnections(xyConnections)

  // Generate the tiled via topology grid
  const {
    regions,
    ports,
    viaTile: generatedViaTile,
    tileCount,
  } = generateViaTopologyGrid({
    viaTile,
    bounds,
    tileSize: opts?.tileSize,
    portPitch: opts?.portPitch,
  })

  // Create base graph from tiled regions
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
