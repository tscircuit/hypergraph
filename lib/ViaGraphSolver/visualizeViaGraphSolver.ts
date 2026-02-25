import type { GraphicsObject } from "graphics-debug"
import type {
  JPort,
  JRegion,
  JumperGraph,
} from "../JumperGraphSolver/jumper-types"
import { visualizeJumperGraph } from "../JumperGraphSolver/visualizeJumperGraph"
import type { Candidate } from "../types"
import type { ViaGraphSolver } from "./ViaGraphSolver"

const getConnectionColor = (connectionId: string, alpha = 0.8): string => {
  let hash = 0
  for (let i = 0; i < connectionId.length; i++) {
    hash = connectionId.charCodeAt(i) * 17777 + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsla(${hue}, 70%, 50%, ${alpha})`
}

const NET_COLOR_PALETTE = [
  "rgba(231, 76, 60, 0.35)", // red
  "rgba(46, 204, 113, 0.35)", // green
  "rgba(52, 152, 219, 0.35)", // blue
  "rgba(243, 156, 18, 0.35)", // orange
  "rgba(155, 89, 182, 0.35)", // purple
  "rgba(26, 188, 156, 0.35)", // teal
  "rgba(241, 196, 15, 0.35)", // yellow
  "rgba(230, 126, 34, 0.35)", // dark orange
]
const BOTTOM_LAYER_TRACE_COLOR = "rgba(52, 152, 219, 0.95)"
const BOTTOM_LAYER_TRACE_DASH = "3 2"

export const visualizeViaGraphSolver = (
  solver: ViaGraphSolver,
): GraphicsObject => {
  const graph: JumperGraph = {
    regions: solver.graph.regions as JRegion[],
    ports: solver.graph.ports as JPort[],
  }

  const graphics = visualizeJumperGraph(graph, {
    connections: solver.connections,
    ...(solver.iterations > 0
      ? {
          hideRegionPortLines: true,
          hideConnectionLines: true,
          hidePortPoints: true,
        }
      : {}),
  }) as Required<GraphicsObject>

  if (solver.iterations === 0) {
    for (const polygon of graphics.polygons) {
      polygon.stroke = "rgba(128, 128, 128, 0.5)"
      polygon.strokeWidth = 0.03
    }
  }

  // Apply per-net colors to net region polygons.
  // The polygons array follows the same order as graph.regions (for regions
  // that have polygon data). We track a polygon index and match net regions
  // by checking if their regionId is NOT an outer region (T/B/L/R) and NOT
  // a connection region.
  const outerIds = new Set(["T", "B", "L", "R"])
  let netColorIndex = 0
  const netColorMap = new Map<string, string>()
  let polyIndex = 0
  for (const region of graph.regions) {
    const jRegion = region as JRegion
    const hasPolygon = jRegion.d.polygon && jRegion.d.polygon.length >= 3
    if (!hasPolygon) continue

    const suffix = jRegion.regionId.split(":").pop() ?? ""
    const isOuter = outerIds.has(suffix)

    if (!isOuter && !jRegion.d.isConnectionRegion) {
      // This is a net region — assign a color
      if (!netColorMap.has(suffix)) {
        netColorMap.set(
          suffix,
          NET_COLOR_PALETTE[netColorIndex % NET_COLOR_PALETTE.length],
        )
        netColorIndex++
      }
      if (graphics.polygons[polyIndex]) {
        graphics.polygons[polyIndex].fill = netColorMap.get(suffix)!
      }
    }
    polyIndex++
  }

  // Draw active connection line
  if (solver.currentConnection && !solver.solved) {
    const connectionColor = getConnectionColor(
      solver.currentConnection.connectionId,
    )
    const startRegion = solver.currentConnection.startRegion as JRegion
    const endRegion = solver.currentConnection.endRegion as JRegion

    const startCenter = {
      x: (startRegion.d.bounds.minX + startRegion.d.bounds.maxX) / 2,
      y: (startRegion.d.bounds.minY + startRegion.d.bounds.maxY) / 2,
    }
    const endCenter = {
      x: (endRegion.d.bounds.minX + endRegion.d.bounds.maxX) / 2,
      y: (endRegion.d.bounds.minY + endRegion.d.bounds.maxY) / 2,
    }

    graphics.lines.push({
      points: [startCenter, endCenter],
      strokeColor: connectionColor,
      strokeDash: "10 5",
    })

    graphics.points.push({
      x: startCenter.x - 0.1,
      y: startCenter.y + 0.1,
      color: connectionColor,
      label: [solver.currentConnection.connectionId, "start"].join("\n"),
    })

    graphics.points.push({
      x: endCenter.x - 0.1,
      y: endCenter.y + 0.1,
      color: connectionColor,
      label: [solver.currentConnection.connectionId, "end"].join("\n"),
    })
  }

  // Draw solved routes
  for (const solvedRoute of solver.solvedRoutes) {
    const connectionColor = getConnectionColor(
      solvedRoute.connection.connectionId,
    )
    const lineSegments = solver.getSolvedRouteLineSegments(solvedRoute)

    for (const lineSegment of lineSegments) {
      const isBottomLayer = lineSegment.layer === "bottom"
      graphics.lines.push({
        points: lineSegment.points,
        strokeColor: isBottomLayer ? BOTTOM_LAYER_TRACE_COLOR : connectionColor,
        ...(isBottomLayer ? { strokeDash: BOTTOM_LAYER_TRACE_DASH } : {}),
      })
    }
  }

  // Draw candidates (at most 10)
  const candidates = solver.candidateQueue.peekMany(10)
  for (
    let candidateIndex = 0;
    candidateIndex < candidates.length;
    candidateIndex++
  ) {
    const candidate = candidates[candidateIndex] as Candidate<JRegion, JPort>
    const port = candidate.port as JPort
    const isNext = candidateIndex === 0

    graphics.points.push({
      x: port.d.x,
      y: port.d.y,
      color: isNext ? "green" : "rgba(128, 128, 128, 0.25)",
      label: [
        candidate.port.portId,
        `g: ${candidate.g.toFixed(2)}`,
        `h: ${candidate.h.toFixed(2)}`,
        `f: ${candidate.f.toFixed(2)}`,
      ].join("\n"),
    })
  }

  // Draw path of next candidate to be processed
  const nextCandidate = candidates[0] as Candidate<JRegion, JPort> | undefined
  if (!solver.solved && nextCandidate && solver.currentConnection) {
    const connectionColor = getConnectionColor(
      solver.currentConnection.connectionId,
    )
    const activePath: { x: number; y: number }[] = []
    let cursor: Candidate | undefined = nextCandidate

    while (cursor) {
      const port = cursor.port as JPort
      activePath.unshift({ x: port.d.x, y: port.d.y })
      cursor = cursor.parent
    }

    if (activePath.length > 1) {
      graphics.lines.push({
        points: activePath,
        strokeColor: connectionColor,
      })
    }
  }

  // Draw via circles for context
  if (solver.viaTile) {
    if (!graphics.circles) graphics.circles = []
    for (const [netName, vias] of Object.entries(solver.viaTile.viasByNet)) {
      const netColor = netColorMap.get(netName)
      const viaFill = netColor
        ? netColor.replace("0.35", "0.5")
        : "rgba(255, 0, 0, 0.3)"
      for (const via of vias) {
        graphics.circles.push({
          center: via.position,
          radius: via.diameter / 2,
          fill: viaFill,
          label: netName,
        })
      }
    }
  }

  return graphics
}
