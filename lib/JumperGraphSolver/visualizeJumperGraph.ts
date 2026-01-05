import type { GraphicsObject } from "graphics-debug"
import type { JumperGraph } from "./jumper-types"

export const visualizeJumperGraph = (graph: JumperGraph): GraphicsObject => {
  const graphics = {
    arrows: [],
    circles: [],
    title: "Jumper Graph",
    lines: [],
    points: [],
    rects: [],
    texts: [],
    coordinateSystem: "cartesian",
  } as Required<GraphicsObject>

  // Draw regions as rectangles
  for (const region of graph.regions) {
    const { bounds, isPad, isThroughJumper } = region.d
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerY = (bounds.minY + bounds.maxY) / 2
    const width = bounds.maxX - bounds.minX
    const height = bounds.maxY - bounds.minY

    let fill: string
    if (isThroughJumper) {
      fill = "rgba(100, 200, 100, 0.5)" // green for throughjumper
    } else if (isPad) {
      fill = "rgba(255, 200, 100, 0.5)" // orange for pads
    } else {
      fill = "rgba(200, 200, 255, 0.3)" // blue for other regions
    }

    graphics.rects.push({
      center: { x: centerX, y: centerY },
      width: width - 0.1,
      height: height - 0.1,
      fill,
    })
  }

  // Draw ports as small circles with labels
  for (const port of graph.ports) {
    // Extract short region names (last part after colon)
    const r1Name = port.region1.regionId.split(":").pop() ?? port.region1.regionId
    const r2Name = port.region2.regionId.split(":").pop() ?? port.region2.regionId

    graphics.circles.push({
      center: { x: port.d.x, y: port.d.y },
      radius: 0.05,
      fill: "red",
      stroke: "darkred",
      label: `${r1Name}-${r2Name}`,
    })
  }

  // Draw lines connecting ports to show potential paths
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

  return graphics
}
