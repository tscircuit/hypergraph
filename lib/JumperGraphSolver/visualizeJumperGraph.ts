import type { GraphicsObject } from "graphics-debug"
import type { Connection } from "../types"
import type { JumperGraph } from "./jumper-types"

export type JumperGraphVisualizationOptions = {
  connections?: Connection[]
  hideRegionPortLines?: boolean
  hideConnectionLines?: boolean
  hidePortPoints?: boolean
}

export const visualizeJumperGraph = (
  graph: JumperGraph,
  options?: JumperGraphVisualizationOptions,
): GraphicsObject => {
  const graphics = {
    arrows: [],
    circles: [],
    title: "Jumper Graph",
    lines: [],
    points: [],
    rects: [],
    texts: [],
    polygons: [],
    coordinateSystem: "cartesian",
  } as Required<GraphicsObject>

  // Draw regions as rectangles or polygons
  for (const region of graph.regions) {
    const { bounds, isPad, isThroughJumper, isConnectionRegion, polygon } =
      region.d
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerY = (bounds.minY + bounds.maxY) / 2
    const width = bounds.maxX - bounds.minX
    const height = bounds.maxY - bounds.minY

    let fill: string
    if (isConnectionRegion) {
      fill = "rgba(255, 100, 255, 0.6)" // magenta for connection regions
    } else if (isThroughJumper) {
      fill = "rgba(100, 200, 100, 0.5)" // green for throughjumper
    } else if (isPad) {
      fill = "rgba(255, 200, 100, 0.5)" // orange for pads
    } else {
      fill = "rgba(200, 200, 255, 0.1)" // blue for other regions
    }

    if (polygon && polygon.length >= 3) {
      const points = polygon
      graphics.polygons.push({
        points,
        fill,
      })
    } else {
      graphics.rects.push({
        center: { x: centerX, y: centerY },
        width: width - 0.1,
        height: height - 0.1,
        fill,
      })
    }
  }

  // Draw ports as small circles with labels
  if (!options?.hidePortPoints) {
    for (const port of graph.ports) {
      // Extract short region names (last part after colon)
      const r1Name =
        port.region1.regionId.split(":").pop() ?? port.region1.regionId
      const r2Name =
        port.region2.regionId.split(":").pop() ?? port.region2.regionId

      graphics.circles.push({
        center: { x: port.d.x, y: port.d.y },
        radius: 0.05,
        fill: "rgba(128, 128, 128, 0.5)",
        label: `${r1Name}-${r2Name}`,
      })
    }
  }

  // Draw lines connecting ports to show potential paths
  if (!options?.hideRegionPortLines) {
    for (const port of graph.ports) {
      const r1Center = {
        x: (port.region1.d.bounds.minX + port.region1.d.bounds.maxX) / 2,
        y: (port.region1.d.bounds.minY + port.region1.d.bounds.maxY) / 2,
      }
      const r2Center = {
        x: (port.region2.d.bounds.minX + port.region2.d.bounds.maxX) / 2,
        y: (port.region2.d.bounds.minY + port.region2.d.bounds.maxY) / 2,
      }

      // Draw line from region1 center through port to region2 center
      graphics.lines.push({
        points: [r1Center, { x: port.d.x, y: port.d.y }, r2Center],
        strokeColor: "rgba(100, 100, 100, 0.3)",
      })
    }
  }

  // Draw connections if provided
  if (options?.connections && !options?.hideConnectionLines) {
    for (const connection of options.connections) {
      const startRegion = connection.startRegion as { d: { bounds: any } }
      const endRegion = connection.endRegion as { d: { bounds: any } }

      const startCenter = {
        x: (startRegion.d.bounds.minX + startRegion.d.bounds.maxX) / 2,
        y: (startRegion.d.bounds.minY + startRegion.d.bounds.maxY) / 2,
      }
      const endCenter = {
        x: (endRegion.d.bounds.minX + endRegion.d.bounds.maxX) / 2,
        y: (endRegion.d.bounds.minY + endRegion.d.bounds.maxY) / 2,
      }

      // Draw an arrow from start to end region with label at midpoint
      const midX = (startCenter.x + endCenter.x) / 2
      const midY = (startCenter.y + endCenter.y) / 2

      graphics.lines.push({
        points: [startCenter, endCenter],
        strokeColor: "rgba(255, 50, 150, 0.8)",
        strokeDash: "3 3",
      })

      graphics.points.push({
        x: midX,
        y: midY,
        color: "rgba(200, 0, 100, 1)",
        label: connection.connectionId,
      })
    }
  }

  return graphics
}
