import type { Connection } from "../../types"
import type { JPort, JRegion, JumperGraph } from "../jumper-types"
import { calculateGraphBounds } from "./calculateGraphBounds"
import { createConnectionPort } from "./createConnectionPort"
import { createConnectionRegion } from "./createConnectionRegion"
import { findBoundaryRegion } from "./findBoundaryRegion"

export type XYConnection = {
  start: { x: number; y: number }
  end: { x: number; y: number }
  connectionId: string
}

export type JumperGraphWithConnections = JumperGraph & {
  connections: Connection[]
}

/**
 * Creates a new graph from a base graph with additional connection regions at
 * specified positions on the boundary. Connection regions are 0.4x0.4 pseudo-regions
 * that contain one port point connecting them to the grid boundary.
 */
export const createGraphWithConnectionsFromBaseGraph = (
  baseGraph: JumperGraph,
  xyConnections: XYConnection[],
): JumperGraphWithConnections => {
  const regions: JRegion[] = [...baseGraph.regions]
  const ports: JPort[] = [...baseGraph.ports]
  const connections: Connection[] = []

  const graphBounds = calculateGraphBounds(baseGraph.regions)

  for (const xyConn of xyConnections) {
    const { start, end, connectionId } = xyConn

    const startRegion = createConnectionRegion(
      `conn:${connectionId}:start`,
      start.x,
      start.y,
    )
    regions.push(startRegion)

    const endRegion = createConnectionRegion(
      `conn:${connectionId}:end`,
      end.x,
      end.y,
    )
    regions.push(endRegion)

    const startBoundary = findBoundaryRegion(
      start.x,
      start.y,
      baseGraph.regions,
      graphBounds,
    )
    if (startBoundary) {
      const startPort = createConnectionPort(
        `conn:${connectionId}:start-port`,
        startRegion,
        startBoundary.region,
        startBoundary.portPosition,
      )
      ports.push(startPort)
    }

    const endBoundary = findBoundaryRegion(
      end.x,
      end.y,
      baseGraph.regions,
      graphBounds,
    )
    if (endBoundary) {
      const endPort = createConnectionPort(
        `conn:${connectionId}:end-port`,
        endRegion,
        endBoundary.region,
        endBoundary.portPosition,
      )
      ports.push(endPort)
    }

    const connection: Connection = {
      connectionId,
      mutuallyConnectedNetworkId: connectionId,
      startRegion,
      endRegion,
    }
    connections.push(connection)
  }

  return {
    regions,
    ports,
    connections,
  }
}
