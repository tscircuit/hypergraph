import type { Connection, HyperGraph, SerializedConnection } from "../types"
import type { JRegion } from "./jumper-types"
import { chordsCross, perimeterT } from "./perimeterChordUtils"

/**
 * Counts the number of crossings between input connections using the perimeter
 * chord method. This is the same technique used in the benchmark problem generator.
 *
 * For each connection, we use the centers of the start/end regions as the
 * connection endpoints, project them onto the perimeter of the overall graph
 * bounds, and count interleaving chord pairs.
 */
export function countInputConnectionCrossings(
  graph: HyperGraph,
  connections: (Connection | SerializedConnection)[],
): number {
  if (connections.length < 2) {
    return 0
  }

  // Compute overall bounds from all regions
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const region of graph.regions) {
    const jRegion = region as JRegion
    if (jRegion.d?.bounds) {
      minX = Math.min(minX, jRegion.d.bounds.minX)
      maxX = Math.max(maxX, jRegion.d.bounds.maxX)
      minY = Math.min(minY, jRegion.d.bounds.minY)
      maxY = Math.max(maxY, jRegion.d.bounds.maxY)
    } else if (jRegion.d?.center) {
      // Fallback to center if bounds not available
      minX = Math.min(minX, jRegion.d.center.x)
      maxX = Math.max(maxX, jRegion.d.center.x)
      minY = Math.min(minY, jRegion.d.center.y)
      maxY = Math.max(maxY, jRegion.d.center.y)
    }
  }

  // Build map from regionId to region center for serialized connections
  const regionCenterMap = new Map<string, { x: number; y: number }>()
  for (const region of graph.regions) {
    const jRegion = region as JRegion
    if (jRegion.d?.center) {
      regionCenterMap.set(region.regionId, jRegion.d.center)
    }
  }

  // Convert connections to chords
  const chords: [number, number][] = []
  const perimeter = 2 * (maxX - minX) + 2 * (maxY - minY)

  for (const conn of connections) {
    let startCenter: { x: number; y: number } | undefined
    let endCenter: { x: number; y: number } | undefined

    if ("startRegion" in conn && conn.startRegion) {
      // Full Connection object
      const startRegion = conn.startRegion as JRegion
      const endRegion = conn.endRegion as JRegion
      startCenter = startRegion.d?.center
      endCenter = endRegion.d?.center
    } else if ("startRegionId" in conn) {
      // SerializedConnection
      startCenter = regionCenterMap.get(conn.startRegionId)
      endCenter = regionCenterMap.get(conn.endRegionId)
    }

    if (!startCenter || !endCenter) {
      continue
    }

    const t1 = perimeterT(startCenter, minX, maxX, minY, maxY)
    const t2 = perimeterT(endCenter, minX, maxX, minY, maxY)
    chords.push([t1, t2])
  }

  // Count crossings between all chord pairs
  let crossings = 0
  for (let i = 0; i < chords.length; i++) {
    for (let j = i + 1; j < chords.length; j++) {
      if (chordsCross(chords[i], chords[j], perimeter)) {
        crossings++
      }
    }
  }

  return crossings
}
