import type { GraphicsObject } from "graphics-debug"
import type { Candidate } from "../types"
import type { JumperGraphSolver } from "./JumperGraphSolver"
import type { JPort, JRegion, JumperGraph } from "./jumper-types"
import { visualizeJumperGraph } from "./visualizeJumperGraph"

const getConnectionColor = (connectionId: string, alpha = 0.8): string => {
  let hash = 0
  for (let i = 0; i < connectionId.length; i++) {
    hash = connectionId.charCodeAt(i) * 17777 + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsla(${hue}, 70%, 50%, ${alpha})`
}

export const visualizeJumperGraphSolver = (
  solver: JumperGraphSolver,
): GraphicsObject => {
  const jumperGraph: JumperGraph = {
    regions: solver.graph.regions as JRegion[],
    ports: solver.graph.ports as JPort[],
  }

  const graphics = visualizeJumperGraph(jumperGraph, {
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
    const pathPoints: { x: number; y: number }[] = []

    for (const candidate of solvedRoute.path) {
      const port = candidate.port as JPort
      pathPoints.push({ x: port.d.x, y: port.d.y })
    }

    if (pathPoints.length > 0) {
      graphics.lines.push({
        points: pathPoints,
        strokeColor: connectionColor,
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

  return graphics
}
