import type { GraphicsObject } from "graphics-debug"
import type { HyperGraphSolver } from "lib/HyperGraphSolver"
import { visualizeJumperGraph } from "lib/JumperGraphSolver/visualizeJumperGraph"
import type { JPort, JRegion } from "lib/index"
import type { Candidate } from "lib/types"

const getConnectionColor = (connectionId: string, alpha = 0.8): string => {
  let hash = 0
  for (let i = 0; i < connectionId.length; i++) {
    hash = connectionId.charCodeAt(i) * 17777 + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsla(${hue}, 70%, 50%, ${alpha})`
}

const NET_COLOR_PALETTE = [
  "rgba(231, 76, 60, 0.35)",
  "rgba(46, 204, 113, 0.35)",
  "rgba(52, 152, 219, 0.35)",
  "rgba(243, 156, 18, 0.35)",
  "rgba(155, 89, 182, 0.35)",
  "rgba(26, 188, 156, 0.35)",
  "rgba(241, 196, 15, 0.35)",
  "rgba(230, 126, 34, 0.35)",
]
/**
 * Renders the current state of the HyperGraphSolver as a GraphicsObject, visualizing regions, ports, connections, solved routes, and candidate paths. This is used in test fixtures to create SVG snapshots of the solver's progress, allowing for visual verification of the solver's behavior at each step.
 */
export const renderHyperGraphSolver = (
  solver: HyperGraphSolver<JRegion, JPort>,
): GraphicsObject => {
  const graphics = visualizeJumperGraph(
    {
      regions: solver.graph.regions as JRegion[],
      ports: solver.graph.ports as JPort[],
    },
    {
      connections: solver.connections,
      ...(solver.iterations > 0
        ? {
            hideRegionPortLines: true,
            hideConnectionLines: true,
            hidePortPoints: true,
          }
        : {}),
    },
  ) as Required<GraphicsObject>

  if (solver.iterations === 0) {
    for (const polygon of graphics.polygons) {
      polygon.stroke = "rgba(128, 128, 128, 0.5)"
      polygon.strokeWidth = 0.03
    }
  }

  const outerIds = new Set(["T", "B", "L", "R"])
  let netColorIndex = 0
  const netColorMap = new Map<string, string>()
  let polyIndex = 0
  for (const region of solver.graph.regions as JRegion[]) {
    const hasPolygon = region.d.polygon && region.d.polygon.length >= 3
    if (!hasPolygon) continue

    const suffix = region.regionId.split(":").pop() ?? ""
    const isOuter = outerIds.has(suffix)
    if (!isOuter && !region.d.isConnectionRegion) {
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

  for (const solvedRoute of solver.solvedRoutes) {
    const connectionColor = getConnectionColor(
      solvedRoute.connection.connectionId,
    )
    const pathPoints = solvedRoute.path.map((candidate) => {
      const port = candidate.port as JPort
      return { x: port.d.x, y: port.d.y }
    })

    if (pathPoints.length < 2) continue

    graphics.lines.push({
      points: pathPoints,
      strokeColor: connectionColor,
    })
  }

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

  return graphics
}
