import type { JPort, JRegion } from "../../JumperGraphSolver/jumper-types"

type ViaData = {
  viaId: string
  diameter: number
  position: { x: number; y: number }
}

import type { ViaTile } from "../ViaGraphSolver"

type HorizontalSegment = { xStart: number; xEnd: number; y: number }
type VerticalSegment = { x: number; yStart: number; yEnd: number }

/**
 * Implicit trace pitch (mm). Used to compute how many ports fit along a
 * shared boundary edge: `count = Math.max(1, Math.floor(length / TRACE_PITCH))`.
 * Matches the 0.4 value used throughout the grid generators.
 */
const TRACE_PITCH = 0.4

/**
 * Generates four outer topology regions (top, bottom, left, right) that wrap
 * around all vias, forming a closed frame that extends to the graph boundary.
 *
 * Each region is a polygon whose inner edge follows the extreme via edges
 * (connected by straight diagonal lines between segments), and whose outer
 * edge is the graph boundary.
 */
export const generateViaTopologyRegions = (
  viaTile: ViaTile,
  opts?: { graphSize?: number; idPrefix?: string },
): { regions: JRegion[]; ports: JPort[] } => {
  const viasByNet = viaTile.viasByNet
  const graphSize = opts?.graphSize ?? 5
  const idPrefix = opts?.idPrefix ?? "via"
  const half = graphSize / 2

  // ── Step 1: Extract per-net extreme via segments ──────────────────────

  const topSegments: HorizontalSegment[] = []
  const bottomSegments: HorizontalSegment[] = []
  const leftSegments: VerticalSegment[] = []
  const rightSegments: VerticalSegment[] = []

  for (const vias of Object.values(viasByNet)) {
    if (vias.length === 0) continue

    // Top: via with maximum Y
    const topVia = vias.reduce((best, v) =>
      v.position.y > best.position.y ? v : best,
    )
    const topY = topVia.position.y + topVia.diameter / 2
    topSegments.push({
      xStart: topVia.position.x - topVia.diameter / 2,
      xEnd: topVia.position.x + topVia.diameter / 2,
      y: topY,
    })

    // Bottom: via with minimum Y
    const bottomVia = vias.reduce((best, v) =>
      v.position.y < best.position.y ? v : best,
    )
    const botY = bottomVia.position.y - bottomVia.diameter / 2
    bottomSegments.push({
      xStart: bottomVia.position.x - bottomVia.diameter / 2,
      xEnd: bottomVia.position.x + bottomVia.diameter / 2,
      y: botY,
    })

    // Left: via with minimum X
    const leftVia = vias.reduce((best, v) =>
      v.position.x < best.position.x ? v : best,
    )
    const leftX = leftVia.position.x - leftVia.diameter / 2
    leftSegments.push({
      x: leftX,
      yStart: leftVia.position.y - leftVia.diameter / 2,
      yEnd: leftVia.position.y + leftVia.diameter / 2,
    })

    // Right: via with maximum X
    const rightVia = vias.reduce((best, v) =>
      v.position.x > best.position.x ? v : best,
    )
    const rightX = rightVia.position.x + rightVia.diameter / 2
    rightSegments.push({
      x: rightX,
      yStart: rightVia.position.y - rightVia.diameter / 2,
      yEnd: rightVia.position.y + rightVia.diameter / 2,
    })
  }

  // ── Sort segments ────────────────────────────────────────────────────

  // Horizontal segments sorted by X (left to right)
  topSegments.sort((a, b) => a.xStart - b.xStart)
  bottomSegments.sort((a, b) => a.xStart - b.xStart)

  // Vertical segments sorted by Y (bottom to top)
  leftSegments.sort((a, b) => a.yStart - b.yStart)
  rightSegments.sort((a, b) => a.yStart - b.yStart)

  // ── Key meeting points ───────────────────────────────────────────────

  const lTop = leftSegments[leftSegments.length - 1] // topmost left segment
  const lBot = leftSegments[0] // bottommost left segment
  const rTop = rightSegments[rightSegments.length - 1] // topmost right segment
  const rBot = rightSegments[0] // bottommost right segment

  // ── Step 2: Build polygon regions ────────────────────────────────────

  // Helper to compute bounding box from polygon points
  const boundsFromPolygon = (
    points: { x: number; y: number }[],
  ): { minX: number; maxX: number; minY: number; maxY: number } => {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of points) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    return { minX, maxX, minY, maxY }
  }

  const createRegion = (
    id: string,
    polygon: { x: number; y: number }[],
    opts?: { isViaRegion?: boolean },
  ): JRegion => {
    const bounds = boundsFromPolygon(polygon)
    return {
      regionId: `${idPrefix}:${id}`,
      ports: [],
      d: {
        bounds,
        center: {
          x: (bounds.minX + bounds.maxX) / 2,
          y: (bounds.minY + bounds.maxY) / 2,
        },
        polygon,
        isPad: false,
        isViaRegion: opts?.isViaRegion,
      },
    }
  }

  // ── TOP Region Polygon ───────────────────────────────────────────────
  //
  // Traversal (counterclockwise in cartesian):
  //   1. (-half, half) — top-left graph corner
  //   2. (half, half) — top-right graph corner
  //   3. (half, rTop.yEnd) — drop down right edge to right region's top
  //   4. (rTop.x, rTop.yEnd) — horizontal left to right region's top segment
  //   5. Diagonal to rightmost top segment end, walk segments right-to-left
  //   6. Diagonal from leftmost top segment start to left region's top
  //   7. (lTop.x, lTop.yEnd) — left region's top segment
  //   8. (-half, lTop.yEnd) — horizontal left to graph boundary
  //   9. Back to (-half, half)

  const topPolygon: { x: number; y: number }[] = []

  // Graph boundary top edge
  topPolygon.push({ x: -half, y: half })
  topPolygon.push({ x: half, y: half })

  // Drop down right side to meet right region's top
  topPolygon.push({ x: half, y: rTop.yEnd })
  topPolygon.push({ x: rTop.x, y: rTop.yEnd })

  // Diagonal to rightmost top segment, then walk segments right-to-left
  const nTop = topSegments.length
  for (let i = nTop - 1; i >= 0; i--) {
    topPolygon.push({ x: topSegments[i].xEnd, y: topSegments[i].y })
    topPolygon.push({ x: topSegments[i].xStart, y: topSegments[i].y })
  }

  // Diagonal from leftmost top segment to left region's top
  topPolygon.push({ x: lTop.x, y: lTop.yEnd })

  // Horizontal left to graph boundary
  topPolygon.push({ x: -half, y: lTop.yEnd })

  // Close (back to top-left corner, implicit)

  const topRegion = createRegion("T", topPolygon)

  // ── BOTTOM Region Polygon ────────────────────────────────────────────
  //
  // Mirror of top. Traversal:
  //   1. (-half, -half) — bottom-left graph corner
  //   2. (half, -half) — bottom-right graph corner
  //   3. (half, rBot.yStart) — rise up right edge
  //   4. (rBot.x, rBot.yStart) — horizontal left to right region's bottom
  //   5. Walk bottom segments right-to-left
  //   6. Diagonal to left region's bottom
  //   7. (-half, lBot.yStart) — horizontal left to graph boundary
  //   8. Back to (-half, -half)

  const bottomPolygon: { x: number; y: number }[] = []

  bottomPolygon.push({ x: -half, y: -half })
  bottomPolygon.push({ x: half, y: -half })
  bottomPolygon.push({ x: half, y: rBot.yStart })
  bottomPolygon.push({ x: rBot.x, y: rBot.yStart })

  const nBot = bottomSegments.length
  for (let i = nBot - 1; i >= 0; i--) {
    bottomPolygon.push({ x: bottomSegments[i].xEnd, y: bottomSegments[i].y })
    bottomPolygon.push({
      x: bottomSegments[i].xStart,
      y: bottomSegments[i].y,
    })
  }

  bottomPolygon.push({ x: lBot.x, y: lBot.yStart })
  bottomPolygon.push({ x: -half, y: lBot.yStart })

  const bottomRegion = createRegion("B", bottomPolygon)

  // ── RIGHT Region Polygon ─────────────────────────────────────────────
  //
  // Traversal:
  //   1. (half, rBot.yStart) — bottom-right (meets bottom region)
  //   2. (rBot.x, rBot.yStart) — horizontal left to bottom right segment
  //   3. Walk right segments bottom-to-top (diagonal connections between)
  //   4. (rTop.x, rTop.yEnd) — topmost right segment end
  //   5. (half, rTop.yEnd) — horizontal right to graph boundary (meets top)
  //   6. Down the right boundary back to start

  const rightPolygon: { x: number; y: number }[] = []

  rightPolygon.push({ x: half, y: rBot.yStart })
  rightPolygon.push({ x: rBot.x, y: rBot.yStart })

  for (let i = 0; i < rightSegments.length; i++) {
    rightPolygon.push({ x: rightSegments[i].x, y: rightSegments[i].yStart })
    rightPolygon.push({ x: rightSegments[i].x, y: rightSegments[i].yEnd })
  }

  rightPolygon.push({ x: half, y: rTop.yEnd })

  // Close down the right boundary (back to start, implicit)

  const rightRegion = createRegion("R", rightPolygon)

  // ── LEFT Region Polygon ──────────────────────────────────────────────
  //
  // Traversal:
  //   1. (-half, lBot.yStart) — bottom-left (meets bottom region)
  //   2. (lBot.x, lBot.yStart) — horizontal right to bottom left segment
  //   3. Walk left segments bottom-to-top (diagonal connections between)
  //   4. (lTop.x, lTop.yEnd) — topmost left segment end
  //   5. (-half, lTop.yEnd) — horizontal left to graph boundary (meets top)
  //   6. Down the left boundary back to start

  const leftPolygon: { x: number; y: number }[] = []

  leftPolygon.push({ x: -half, y: lBot.yStart })
  leftPolygon.push({ x: lBot.x, y: lBot.yStart })

  for (let i = 0; i < leftSegments.length; i++) {
    leftPolygon.push({ x: leftSegments[i].x, y: leftSegments[i].yStart })
    leftPolygon.push({ x: leftSegments[i].x, y: leftSegments[i].yEnd })
  }

  leftPolygon.push({ x: -half, y: lTop.yEnd })

  // Close down the left boundary (back to start, implicit)

  const leftRegion = createRegion("L", leftPolygon)

  // ── Collect regions ──────────────────────────────────────────────────

  const regions: JRegion[] = [topRegion, bottomRegion, leftRegion, rightRegion]
  const ports: JPort[] = []

  // ── Step 3: Create ports at shared boundaries ────────────────────────
  //
  // Ports are distributed evenly along each shared boundary between
  // adjacent outer regions. The number of ports is determined by how many
  // traces fit: count = max(1, floor(edgeLength / TRACE_PITCH)).
  // Port positions use t = (i + 0.5) / count, matching the pattern from
  // createMultiplePorts in the grid generators.

  const createPort = (
    id: string,
    region1: JRegion,
    region2: JRegion,
    x: number,
    y: number,
  ): JPort => {
    const port: JPort = {
      portId: `${idPrefix}:${id}`,
      region1,
      region2,
      d: { x, y },
    }
    region1.ports.push(port)
    region2.ports.push(port)
    return port
  }

  /**
   * Create multiple evenly-distributed ports along a horizontal shared
   * boundary segment from (xStart, y) to (xEnd, y).
   */
  const createHorizontalPorts = (
    groupId: string,
    region1: JRegion,
    region2: JRegion,
    xStart: number,
    xEnd: number,
    y: number,
  ) => {
    const length = Math.abs(xEnd - xStart)
    const count = Math.max(1, Math.floor(length / TRACE_PITCH))
    const minX = Math.min(xStart, xEnd)
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count
      const x = minX + t * length
      const portId = count === 1 ? groupId : `${groupId}_${i}`
      ports.push(createPort(portId, region1, region2, x, y))
    }
  }

  // Top-Right shared boundary: (rTop.x, rTop.yEnd) → (half, rTop.yEnd)
  createHorizontalPorts("T-R", topRegion, rightRegion, rTop.x, half, rTop.yEnd)

  // Top-Left shared boundary: (-half, lTop.yEnd) → (lTop.x, lTop.yEnd)
  createHorizontalPorts("T-L", topRegion, leftRegion, -half, lTop.x, lTop.yEnd)

  // Bottom-Right shared boundary: (rBot.x, rBot.yStart) → (half, rBot.yStart)
  createHorizontalPorts(
    "B-R",
    bottomRegion,
    rightRegion,
    rBot.x,
    half,
    rBot.yStart,
  )

  // Bottom-Left shared boundary: (-half, lBot.yStart) → (lBot.x, lBot.yStart)
  createHorizontalPorts(
    "B-L",
    bottomRegion,
    leftRegion,
    -half,
    lBot.x,
    lBot.yStart,
  )

  // ── Step 4: Per-net polygon regions ──────────────────────────────────
  //
  // For each net, create a polygon region that wraps around all its vias.
  // The polygon is formed by 4 segments (top, right, bottom, left) at the
  // extreme via edges, connected by straight diagonal lines.
  //
  // Clockwise traversal:
  //   top-left → top-right → right-top → right-bottom →
  //   bottom-right → bottom-left → left-bottom → left-top → close

  for (const [netName, vias] of Object.entries(viasByNet)) {
    if (vias.length === 0) continue

    // Find extreme vias for this net
    const topVia = vias.reduce((best, v) =>
      v.position.y > best.position.y ? v : best,
    )
    const bottomVia = vias.reduce((best, v) =>
      v.position.y < best.position.y ? v : best,
    )
    const leftVia = vias.reduce((best, v) =>
      v.position.x < best.position.x ? v : best,
    )
    const rightVia = vias.reduce((best, v) =>
      v.position.x > best.position.x ? v : best,
    )

    // Compute edge segments
    const netTopSeg: HorizontalSegment = {
      xStart: topVia.position.x - topVia.diameter / 2,
      xEnd: topVia.position.x + topVia.diameter / 2,
      y: topVia.position.y + topVia.diameter / 2,
    }
    const netBotSeg: HorizontalSegment = {
      xStart: bottomVia.position.x - bottomVia.diameter / 2,
      xEnd: bottomVia.position.x + bottomVia.diameter / 2,
      y: bottomVia.position.y - bottomVia.diameter / 2,
    }
    const netLeftSeg: VerticalSegment = {
      x: leftVia.position.x - leftVia.diameter / 2,
      yStart: leftVia.position.y - leftVia.diameter / 2,
      yEnd: leftVia.position.y + leftVia.diameter / 2,
    }
    const netRightSeg: VerticalSegment = {
      x: rightVia.position.x + rightVia.diameter / 2,
      yStart: rightVia.position.y - rightVia.diameter / 2,
      yEnd: rightVia.position.y + rightVia.diameter / 2,
    }

    // Build polygon (clockwise):
    //   1. top segment left end
    //   2. top segment right end
    //   3. right segment top end (diagonal from 2)
    //   4. right segment bottom end
    //   5. bottom segment right end (diagonal from 4)
    //   6. bottom segment left end
    //   7. left segment bottom end (diagonal from 6)
    //   8. left segment top end
    //   Close back to 1 (diagonal)
    const netPolygon: { x: number; y: number }[] = [
      { x: netTopSeg.xStart, y: netTopSeg.y },
      { x: netTopSeg.xEnd, y: netTopSeg.y },
      { x: netRightSeg.x, y: netRightSeg.yEnd },
      { x: netRightSeg.x, y: netRightSeg.yStart },
      { x: netBotSeg.xEnd, y: netBotSeg.y },
      { x: netBotSeg.xStart, y: netBotSeg.y },
      { x: netLeftSeg.x, y: netLeftSeg.yStart },
      { x: netLeftSeg.x, y: netLeftSeg.yEnd },
    ]

    const netRegion = createRegion(netName, netPolygon, { isViaRegion: true })
    regions.push(netRegion)

    // ── Ports connecting this net region to the 4 outer regions ────────
    //
    // Each net's extreme segment is shared with the corresponding outer
    // region's inner edge. Place a port at the midpoint of each segment.

    // Net → Top: midpoint of top segment
    ports.push(
      createPort(
        `${netName}-T`,
        netRegion,
        topRegion,
        (netTopSeg.xStart + netTopSeg.xEnd) / 2,
        netTopSeg.y,
      ),
    )

    // Net → Bottom: midpoint of bottom segment
    ports.push(
      createPort(
        `${netName}-B`,
        netRegion,
        bottomRegion,
        (netBotSeg.xStart + netBotSeg.xEnd) / 2,
        netBotSeg.y,
      ),
    )

    // Net → Left: midpoint of left segment
    ports.push(
      createPort(
        `${netName}-L`,
        netRegion,
        leftRegion,
        netLeftSeg.x,
        (netLeftSeg.yStart + netLeftSeg.yEnd) / 2,
      ),
    )

    // Net → Right: midpoint of right segment
    ports.push(
      createPort(
        `${netName}-R`,
        netRegion,
        rightRegion,
        netRightSeg.x,
        (netRightSeg.yStart + netRightSeg.yEnd) / 2,
      ),
    )
  }

  return { regions, ports }
}
