import type { JPort, JRegion, JumperGraph } from "../jumper-types"
import { computeBoundsCenter } from "../geometry/getBoundsCenter"
import { dims1206x4 } from "./generateSingleJumperX4Regions"
import { calculateGraphBounds } from "./calculateGraphBounds"
import { applyTransformToGraph } from "../geometry/applyTransformToGraph"
import { compose, translate, rotate } from "transformation-matrix"

export const generateJumperX4Grid = ({
  cols,
  rows,
  marginX,
  marginY,
  innerColChannelPointCount = 1,
  innerRowChannelPointCount = 1,
  regionsBetweenPads = false,
  outerPaddingX: outerPaddingXParam = 0.5,
  outerPaddingY: outerPaddingYParam = 0.5,
  outerChannelXPointCount,
  outerChannelYPointCount,
  orientation = "vertical",
  center,
  bounds,
}: {
  cols: number
  rows: number
  marginX: number
  marginY: number
  innerColChannelPointCount?: number
  innerRowChannelPointCount?: number
  regionsBetweenPads?: boolean
  outerPaddingX?: number
  outerPaddingY?: number
  outerChannelXPointCount?: number
  outerChannelYPointCount?: number
  orientation?: "vertical" | "horizontal"
  center?: { x: number; y: number }
  bounds?: { minX: number; maxX: number; minY: number; maxY: number }
}): JumperGraph => {
  const regions: JRegion[] = []
  const ports: JPort[] = []

  const {
    padWidth,
    padHeight,
    leftPadCenterX,
    rightPadCenterX,
    row1CenterY,
    row2CenterY,
    row3CenterY,
    row4CenterY,
  } = dims1206x4

  const padHalfWidth = padWidth / 2
  const padHalfHeight = padHeight / 2

  // Calculate center-to-center distances for the grid
  // Horizontal spacing: from one cell center to next cell center
  const cellWidth = rightPadCenterX - leftPadCenterX + padWidth // total width of pads region
  const horizontalSpacing = cellWidth + marginX

  // Vertical spacing: from one cell center to next cell center
  const cellHeight = row1CenterY - row4CenterY + padHeight // total height of pads region
  const verticalSpacing = cellHeight + marginY

  // Calculate outer padding from bounds if specified
  let outerPaddingX = outerPaddingXParam
  let outerPaddingY = outerPaddingYParam
  if (bounds) {
    // Content dimensions (without outer padding)
    const contentWidth = cols * cellWidth + (cols - 1) * marginX
    const contentHeight = rows * cellHeight + (rows - 1) * marginY
    const boundsWidth = bounds.maxX - bounds.minX
    const boundsHeight = bounds.maxY - bounds.minY
    outerPaddingX = (boundsWidth - contentWidth) / 2
    outerPaddingY = (boundsHeight - contentHeight) / 2
  }

  // Calculate outer channel points: use provided value or derive from outer padding
  const effectiveOuterChannelXPoints =
    outerChannelXPointCount ?? Math.max(1, Math.floor(outerPaddingX / 0.4))
  const effectiveOuterChannelYPoints =
    outerChannelYPointCount ?? Math.max(1, Math.floor(outerPaddingY / 0.4))

  // Store cells for later port connections
  const cells: {
    pad1: JRegion
    pad2: JRegion
    pad3: JRegion
    pad4: JRegion
    pad5: JRegion
    pad6: JRegion
    pad7: JRegion
    pad8: JRegion
    underjumper: JRegion
    throughjumper1: JRegion
    throughjumper2: JRegion
    throughjumper3: JRegion
    throughjumper4: JRegion
    top: JRegion | null
    bottom: JRegion | null
    left: JRegion | null
    right: JRegion | null
    // Between-pad regions (only when regionsBetweenPads is true)
    leftBP12: JRegion | null
    leftBP23: JRegion | null
    leftBP34: JRegion | null
    rightBP87: JRegion | null
    rightBP76: JRegion | null
    rightBP65: JRegion | null
  }[][] = []

  // Helper to create a region
  const createRegion = (
    id: string,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    isPad: boolean,
    isThroughJumper?: boolean,
  ): JRegion => ({
    regionId: id,
    ports: [],
    d: { bounds, center: computeBoundsCenter(bounds), isPad, isThroughJumper },
  })

  // Helper to create a port at the boundary between two regions
  const createPort = (
    id: string,
    region1: JRegion,
    region2: JRegion,
  ): JPort => {
    const b1 = region1.d.bounds
    const b2 = region2.d.bounds

    // Find boundary center
    let x: number
    let y: number
    if (Math.abs(b1.maxX - b2.minX) < 0.001) {
      // region1 is left of region2
      x = b1.maxX
      y = (Math.max(b1.minY, b2.minY) + Math.min(b1.maxY, b2.maxY)) / 2
    } else if (Math.abs(b1.minX - b2.maxX) < 0.001) {
      // region1 is right of region2
      x = b1.minX
      y = (Math.max(b1.minY, b2.minY) + Math.min(b1.maxY, b2.maxY)) / 2
    } else if (Math.abs(b1.maxY - b2.minY) < 0.001) {
      // region1 is below region2
      x = (Math.max(b1.minX, b2.minX) + Math.min(b1.maxX, b2.maxX)) / 2
      y = b1.maxY
    } else {
      // region1 is above region2
      x = (Math.max(b1.minX, b2.minX) + Math.min(b1.maxX, b2.maxX)) / 2
      y = b1.minY
    }

    const port: JPort = {
      portId: id,
      region1,
      region2,
      d: { x, y },
    }
    region1.ports.push(port)
    region2.ports.push(port)
    return port
  }

  // Helper to create multiple ports distributed along a boundary between two regions
  const createMultiplePorts = (
    idPrefix: string,
    region1: JRegion,
    region2: JRegion,
    count: number,
  ): JPort[] => {
    if (count <= 0) return []
    if (count === 1) {
      return [createPort(idPrefix, region1, region2)]
    }

    const b1 = region1.d.bounds
    const b2 = region2.d.bounds
    const result: JPort[] = []

    // Determine boundary orientation and shared extent
    let isVerticalBoundary: boolean
    let boundaryCoord: number
    let sharedMin: number
    let sharedMax: number

    if (Math.abs(b1.maxX - b2.minX) < 0.001) {
      // region1 is left of region2 (vertical boundary)
      isVerticalBoundary = true
      boundaryCoord = b1.maxX
      sharedMin = Math.max(b1.minY, b2.minY)
      sharedMax = Math.min(b1.maxY, b2.maxY)
    } else if (Math.abs(b1.minX - b2.maxX) < 0.001) {
      // region1 is right of region2 (vertical boundary)
      isVerticalBoundary = true
      boundaryCoord = b1.minX
      sharedMin = Math.max(b1.minY, b2.minY)
      sharedMax = Math.min(b1.maxY, b2.maxY)
    } else if (Math.abs(b1.maxY - b2.minY) < 0.001) {
      // region1 is below region2 (horizontal boundary)
      isVerticalBoundary = false
      boundaryCoord = b1.maxY
      sharedMin = Math.max(b1.minX, b2.minX)
      sharedMax = Math.min(b1.maxX, b2.maxX)
    } else {
      // region1 is above region2 (horizontal boundary)
      isVerticalBoundary = false
      boundaryCoord = b1.minY
      sharedMin = Math.max(b1.minX, b2.minX)
      sharedMax = Math.min(b1.maxX, b2.maxX)
    }

    // Create evenly distributed ports
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count // distribute evenly with half-spacing from edges
      const coord = sharedMin + t * (sharedMax - sharedMin)

      const x = isVerticalBoundary ? boundaryCoord : coord
      const y = isVerticalBoundary ? coord : boundaryCoord

      const port: JPort = {
        portId: `${idPrefix}:${i}`,
        region1,
        region2,
        d: { x, y },
      }
      region1.ports.push(port)
      region2.ports.push(port)
      result.push(port)
    }

    return result
  }

  // Generate cells
  for (let row = 0; row < rows; row++) {
    cells[row] = []

    for (let col = 0; col < cols; col++) {
      const idPrefix = `cell_${row}_${col}`
      const centerX = col * horizontalSpacing
      const centerY = -row * verticalSpacing // Y decreases as row increases

      // Calculate pad center positions for this cell
      // Left side pads (pins 1-4, top to bottom)
      const p1CenterX = centerX + leftPadCenterX
      const p1CenterY = centerY + row1CenterY
      const p2CenterX = centerX + leftPadCenterX
      const p2CenterY = centerY + row2CenterY
      const p3CenterX = centerX + leftPadCenterX
      const p3CenterY = centerY + row3CenterY
      const p4CenterX = centerX + leftPadCenterX
      const p4CenterY = centerY + row4CenterY

      // Right side pads (pins 5-8, bottom to top - CCW numbering)
      const p5CenterX = centerX + rightPadCenterX
      const p5CenterY = centerY + row4CenterY
      const p6CenterX = centerX + rightPadCenterX
      const p6CenterY = centerY + row3CenterY
      const p7CenterX = centerX + rightPadCenterX
      const p7CenterY = centerY + row2CenterY
      const p8CenterX = centerX + rightPadCenterX
      const p8CenterY = centerY + row1CenterY

      // Helper to create bounds for a pad at given center
      const createPadBounds = (padCenterX: number, padCenterY: number) => ({
        minX: padCenterX - padHalfWidth,
        maxX: padCenterX + padHalfWidth,
        minY: padCenterY - padHalfHeight,
        maxY: padCenterY + padHalfHeight,
      })

      const pad1Bounds = createPadBounds(p1CenterX, p1CenterY)
      const pad2Bounds = createPadBounds(p2CenterX, p2CenterY)
      const pad3Bounds = createPadBounds(p3CenterX, p3CenterY)
      const pad4Bounds = createPadBounds(p4CenterX, p4CenterY)
      const pad5Bounds = createPadBounds(p5CenterX, p5CenterY)
      const pad6Bounds = createPadBounds(p6CenterX, p6CenterY)
      const pad7Bounds = createPadBounds(p7CenterX, p7CenterY)
      const pad8Bounds = createPadBounds(p8CenterX, p8CenterY)

      // Underjumper region - single vertical region in the center between left and right pads
      const underjumperBounds = {
        minX: pad1Bounds.maxX,
        maxX: pad8Bounds.minX,
        minY: pad4Bounds.minY,
        maxY: pad1Bounds.maxY,
      }

      // Throughjumper regions (conductive body of each resistor)
      const throughjumperHeight = 0.3
      const throughjumper1Bounds = {
        minX: p1CenterX,
        maxX: p8CenterX,
        minY: p1CenterY - throughjumperHeight / 2,
        maxY: p1CenterY + throughjumperHeight / 2,
      }
      const throughjumper2Bounds = {
        minX: p2CenterX,
        maxX: p7CenterX,
        minY: p2CenterY - throughjumperHeight / 2,
        maxY: p2CenterY + throughjumperHeight / 2,
      }
      const throughjumper3Bounds = {
        minX: p3CenterX,
        maxX: p6CenterX,
        minY: p3CenterY - throughjumperHeight / 2,
        maxY: p3CenterY + throughjumperHeight / 2,
      }
      const throughjumper4Bounds = {
        minX: p4CenterX,
        maxX: p5CenterX,
        minY: p4CenterY - throughjumperHeight / 2,
        maxY: p4CenterY + throughjumperHeight / 2,
      }

      // The full extent of main regions for this cell
      const mainMinX = pad1Bounds.minX
      const mainMaxX = pad8Bounds.maxX
      const mainMinY = pad4Bounds.minY
      const mainMaxY = pad1Bounds.maxY

      // Create main regions
      const pad1 = createRegion(`${idPrefix}:pad1`, pad1Bounds, true)
      const pad2 = createRegion(`${idPrefix}:pad2`, pad2Bounds, true)
      const pad3 = createRegion(`${idPrefix}:pad3`, pad3Bounds, true)
      const pad4 = createRegion(`${idPrefix}:pad4`, pad4Bounds, true)
      const pad5 = createRegion(`${idPrefix}:pad5`, pad5Bounds, true)
      const pad6 = createRegion(`${idPrefix}:pad6`, pad6Bounds, true)
      const pad7 = createRegion(`${idPrefix}:pad7`, pad7Bounds, true)
      const pad8 = createRegion(`${idPrefix}:pad8`, pad8Bounds, true)
      const underjumper = createRegion(
        `${idPrefix}:underjumper`,
        underjumperBounds,
        false,
      )
      const throughjumper1 = createRegion(
        `${idPrefix}:throughjumper1`,
        throughjumper1Bounds,
        false,
        true,
      )
      const throughjumper2 = createRegion(
        `${idPrefix}:throughjumper2`,
        throughjumper2Bounds,
        false,
        true,
      )
      const throughjumper3 = createRegion(
        `${idPrefix}:throughjumper3`,
        throughjumper3Bounds,
        false,
        true,
      )
      const throughjumper4 = createRegion(
        `${idPrefix}:throughjumper4`,
        throughjumper4Bounds,
        false,
        true,
      )

      regions.push(
        pad1,
        pad2,
        pad3,
        pad4,
        pad5,
        pad6,
        pad7,
        pad8,
        underjumper,
        throughjumper1,
        throughjumper2,
        throughjumper3,
        throughjumper4,
      )

      // Between-pad regions (created when regionsBetweenPads is true)
      // Left side: between P1-P2, P2-P3, P3-P4
      // Right side: between P8-P7, P7-P6, P6-P5
      let leftBP12: JRegion | null = null
      let leftBP23: JRegion | null = null
      let leftBP34: JRegion | null = null
      let rightBP87: JRegion | null = null
      let rightBP76: JRegion | null = null
      let rightBP65: JRegion | null = null

      if (regionsBetweenPads) {
        // Left side between-pad regions
        leftBP12 = createRegion(
          `${idPrefix}:L-BP12`,
          {
            minX: pad1Bounds.minX,
            maxX: pad1Bounds.maxX,
            minY: pad2Bounds.maxY,
            maxY: pad1Bounds.minY,
          },
          false,
        )
        leftBP23 = createRegion(
          `${idPrefix}:L-BP23`,
          {
            minX: pad2Bounds.minX,
            maxX: pad2Bounds.maxX,
            minY: pad3Bounds.maxY,
            maxY: pad2Bounds.minY,
          },
          false,
        )
        leftBP34 = createRegion(
          `${idPrefix}:L-BP34`,
          {
            minX: pad3Bounds.minX,
            maxX: pad3Bounds.maxX,
            minY: pad4Bounds.maxY,
            maxY: pad3Bounds.minY,
          },
          false,
        )

        // Right side between-pad regions
        rightBP87 = createRegion(
          `${idPrefix}:R-BP87`,
          {
            minX: pad8Bounds.minX,
            maxX: pad8Bounds.maxX,
            minY: pad7Bounds.maxY,
            maxY: pad8Bounds.minY,
          },
          false,
        )
        rightBP76 = createRegion(
          `${idPrefix}:R-BP76`,
          {
            minX: pad7Bounds.minX,
            maxX: pad7Bounds.maxX,
            minY: pad6Bounds.maxY,
            maxY: pad7Bounds.minY,
          },
          false,
        )
        rightBP65 = createRegion(
          `${idPrefix}:R-BP65`,
          {
            minX: pad6Bounds.minX,
            maxX: pad6Bounds.maxX,
            minY: pad5Bounds.maxY,
            maxY: pad6Bounds.minY,
          },
          false,
        )

        regions.push(
          leftBP12,
          leftBP23,
          leftBP34,
          rightBP87,
          rightBP76,
          rightBP65,
        )
      }

      // Determine which frame regions to create based on grid position
      const isFirstRow = row === 0
      const isFirstCol = col === 0
      const isLastRow = row === rows - 1
      const isLastCol = col === cols - 1

      // Calculate right edge: extends to next cell's pad1.minX, or outerPaddingX if last column
      let frameRightEdge: number
      if (isLastCol) {
        frameRightEdge = mainMaxX + outerPaddingX
      } else {
        // Next cell's leftmost pad minX
        const nextCenterX = (col + 1) * horizontalSpacing
        const nextP1CenterX = nextCenterX + leftPadCenterX
        frameRightEdge = nextP1CenterX - padHalfWidth
      }

      // Top region: only for first row
      let top: JRegion | null = null
      if (isFirstRow) {
        top = createRegion(
          `${idPrefix}:T`,
          {
            minX: isFirstCol ? mainMinX - outerPaddingX : mainMinX,
            maxX: frameRightEdge,
            minY: mainMaxY,
            maxY: mainMaxY + outerPaddingY,
          },
          false,
        )
        regions.push(top)
      }

      // Bottom region: height is marginY (or outerPaddingY for last row)
      let bottom: JRegion | null = null
      const bottomHeight = isLastRow ? outerPaddingY : marginY
      bottom = createRegion(
        `${idPrefix}:B`,
        {
          minX: isFirstCol ? mainMinX - outerPaddingX : mainMinX,
          maxX: frameRightEdge,
          minY: mainMinY - bottomHeight,
          maxY: mainMinY,
        },
        false,
      )
      regions.push(bottom)

      // Left region: only for first column
      let left: JRegion | null = null
      if (isFirstCol) {
        left = createRegion(
          `${idPrefix}:L`,
          {
            minX: mainMinX - outerPaddingX,
            maxX: mainMinX,
            minY: mainMinY,
            maxY: mainMaxY,
          },
          false,
        )
        regions.push(left)
      }

      // Right region: always created
      const right = createRegion(
        `${idPrefix}:R`,
        {
          minX: mainMaxX,
          maxX: frameRightEdge,
          minY: mainMinY,
          maxY: mainMaxY,
        },
        false,
      )
      regions.push(right)

      cells[row][col] = {
        pad1,
        pad2,
        pad3,
        pad4,
        pad5,
        pad6,
        pad7,
        pad8,
        underjumper,
        throughjumper1,
        throughjumper2,
        throughjumper3,
        throughjumper4,
        top,
        bottom,
        left,
        right,
        leftBP12,
        leftBP23,
        leftBP34,
        rightBP87,
        rightBP76,
        rightBP65,
      }

      // Create internal ports for this cell

      // Top frame connections (if top exists)
      if (top) {
        if (left) {
          ports.push(
            ...createMultiplePorts(
              `${idPrefix}:T-L`,
              top,
              left,
              effectiveOuterChannelXPoints,
            ),
          )
        }
        ports.push(
          ...createMultiplePorts(
            `${idPrefix}:T-R`,
            top,
            right,
            isLastCol
              ? effectiveOuterChannelXPoints
              : innerColChannelPointCount,
          ),
        )
        // Top connects to pad1, pad8, and underjumper
        ports.push(createPort(`${idPrefix}:T-P1`, top, pad1))
        ports.push(createPort(`${idPrefix}:T-P8`, top, pad8))

        // Underjumper connections to top - multiple ports when regionsBetweenPads
        if (regionsBetweenPads) {
          const ujBounds = underjumper.d.bounds
          const ujWidth = ujBounds.maxX - ujBounds.minX
          const portSpacing = ujWidth / 5 // 4 ports with equal spacing

          for (let i = 1; i <= 4; i++) {
            const portX = ujBounds.minX + portSpacing * i
            const topUJPort: JPort = {
              portId: `${idPrefix}:T-UJ${i}`,
              region1: top,
              region2: underjumper,
              d: { x: portX, y: ujBounds.maxY },
            }
            top.ports.push(topUJPort)
            underjumper.ports.push(topUJPort)
            ports.push(topUJPort)
          }
        } else {
          ports.push(createPort(`${idPrefix}:T-UJ`, top, underjumper))
        }
      }

      // Bottom frame connections
      if (bottom) {
        if (left) {
          ports.push(
            ...createMultiplePorts(
              `${idPrefix}:B-L`,
              bottom,
              left,
              effectiveOuterChannelXPoints,
            ),
          )
        }
        ports.push(
          ...createMultiplePorts(
            `${idPrefix}:B-R`,
            bottom,
            right,
            isLastCol
              ? effectiveOuterChannelXPoints
              : innerColChannelPointCount,
          ),
        )
        // Bottom connects to pad4, pad5, and underjumper
        ports.push(createPort(`${idPrefix}:B-P4`, bottom, pad4))
        ports.push(createPort(`${idPrefix}:B-P5`, bottom, pad5))

        // Underjumper connections to bottom - multiple ports when regionsBetweenPads
        if (regionsBetweenPads) {
          const ujBounds = underjumper.d.bounds
          const ujWidth = ujBounds.maxX - ujBounds.minX
          const portSpacing = ujWidth / 5 // 4 ports with equal spacing

          for (let i = 1; i <= 4; i++) {
            const portX = ujBounds.minX + portSpacing * i
            const bottomUJPort: JPort = {
              portId: `${idPrefix}:B-UJ${i}`,
              region1: bottom,
              region2: underjumper,
              d: { x: portX, y: ujBounds.minY },
            }
            bottom.ports.push(bottomUJPort)
            underjumper.ports.push(bottomUJPort)
            ports.push(bottomUJPort)
          }
        } else {
          ports.push(createPort(`${idPrefix}:B-UJ`, bottom, underjumper))
        }
      }

      // Left/Right frame to pad connections
      if (left) {
        ports.push(createPort(`${idPrefix}:L-P1`, left, pad1))
        ports.push(createPort(`${idPrefix}:L-P2`, left, pad2))
        ports.push(createPort(`${idPrefix}:L-P3`, left, pad3))
        ports.push(createPort(`${idPrefix}:L-P4`, left, pad4))
      }
      ports.push(createPort(`${idPrefix}:R-P5`, right, pad5))
      ports.push(createPort(`${idPrefix}:R-P6`, right, pad6))
      ports.push(createPort(`${idPrefix}:R-P7`, right, pad7))
      ports.push(createPort(`${idPrefix}:R-P8`, right, pad8))

      // Between-pad region ports
      if (regionsBetweenPads) {
        // Left side between-pad regions connect to left side and underjumper
        if (left) {
          ports.push(createPort(`${idPrefix}:L-BP12`, left, leftBP12!))
          ports.push(createPort(`${idPrefix}:L-BP23`, left, leftBP23!))
          ports.push(createPort(`${idPrefix}:L-BP34`, left, leftBP34!))
        }
        ports.push(createPort(`${idPrefix}:UJ-LBP12`, leftBP12!, underjumper))
        ports.push(createPort(`${idPrefix}:UJ-LBP23`, leftBP23!, underjumper))
        ports.push(createPort(`${idPrefix}:UJ-LBP34`, leftBP34!, underjumper))

        // Right side between-pad regions connect to right side and underjumper
        ports.push(createPort(`${idPrefix}:R-BP87`, right, rightBP87!))
        ports.push(createPort(`${idPrefix}:R-BP76`, right, rightBP76!))
        ports.push(createPort(`${idPrefix}:R-BP65`, right, rightBP65!))
        ports.push(createPort(`${idPrefix}:UJ-RBP87`, rightBP87!, underjumper))
        ports.push(createPort(`${idPrefix}:UJ-RBP76`, rightBP76!, underjumper))
        ports.push(createPort(`${idPrefix}:UJ-RBP65`, rightBP65!, underjumper))
      }

      // Throughjumper1 connections (P1 ↔ P8, top row)
      const tj1LeftPort: JPort = {
        portId: `${idPrefix}:TJ1-P1`,
        region1: throughjumper1,
        region2: pad1,
        d: { x: p1CenterX, y: p1CenterY },
      }
      throughjumper1.ports.push(tj1LeftPort)
      pad1.ports.push(tj1LeftPort)
      ports.push(tj1LeftPort)

      const tj1RightPort: JPort = {
        portId: `${idPrefix}:TJ1-P8`,
        region1: throughjumper1,
        region2: pad8,
        d: { x: p8CenterX, y: p8CenterY },
      }
      throughjumper1.ports.push(tj1RightPort)
      pad8.ports.push(tj1RightPort)
      ports.push(tj1RightPort)

      // Throughjumper2 connections (P2 ↔ P7, second row)
      const tj2LeftPort: JPort = {
        portId: `${idPrefix}:TJ2-P2`,
        region1: throughjumper2,
        region2: pad2,
        d: { x: p2CenterX, y: p2CenterY },
      }
      throughjumper2.ports.push(tj2LeftPort)
      pad2.ports.push(tj2LeftPort)
      ports.push(tj2LeftPort)

      const tj2RightPort: JPort = {
        portId: `${idPrefix}:TJ2-P7`,
        region1: throughjumper2,
        region2: pad7,
        d: { x: p7CenterX, y: p7CenterY },
      }
      throughjumper2.ports.push(tj2RightPort)
      pad7.ports.push(tj2RightPort)
      ports.push(tj2RightPort)

      // Throughjumper3 connections (P3 ↔ P6, third row)
      const tj3LeftPort: JPort = {
        portId: `${idPrefix}:TJ3-P3`,
        region1: throughjumper3,
        region2: pad3,
        d: { x: p3CenterX, y: p3CenterY },
      }
      throughjumper3.ports.push(tj3LeftPort)
      pad3.ports.push(tj3LeftPort)
      ports.push(tj3LeftPort)

      const tj3RightPort: JPort = {
        portId: `${idPrefix}:TJ3-P6`,
        region1: throughjumper3,
        region2: pad6,
        d: { x: p6CenterX, y: p6CenterY },
      }
      throughjumper3.ports.push(tj3RightPort)
      pad6.ports.push(tj3RightPort)
      ports.push(tj3RightPort)

      // Throughjumper4 connections (P4 ↔ P5, bottom row)
      const tj4LeftPort: JPort = {
        portId: `${idPrefix}:TJ4-P4`,
        region1: throughjumper4,
        region2: pad4,
        d: { x: p4CenterX, y: p4CenterY },
      }
      throughjumper4.ports.push(tj4LeftPort)
      pad4.ports.push(tj4LeftPort)
      ports.push(tj4LeftPort)

      const tj4RightPort: JPort = {
        portId: `${idPrefix}:TJ4-P5`,
        region1: throughjumper4,
        region2: pad5,
        d: { x: p5CenterX, y: p5CenterY },
      }
      throughjumper4.ports.push(tj4RightPort)
      pad5.ports.push(tj4RightPort)
      ports.push(tj4RightPort)

      // Horizontal connections from previous cell (A on left, current B on right)
      if (col > 0) {
        const prevCell = cells[row][col - 1]
        // A.right connects to B.pad1, B.pad2, B.pad3, B.pad4
        ports.push(
          createPort(
            `cell_${row}_${col - 1}->cell_${row}_${col}:R-P1`,
            prevCell.right!,
            pad1,
          ),
        )
        ports.push(
          createPort(
            `cell_${row}_${col - 1}->cell_${row}_${col}:R-P2`,
            prevCell.right!,
            pad2,
          ),
        )
        ports.push(
          createPort(
            `cell_${row}_${col - 1}->cell_${row}_${col}:R-P3`,
            prevCell.right!,
            pad3,
          ),
        )
        ports.push(
          createPort(
            `cell_${row}_${col - 1}->cell_${row}_${col}:R-P4`,
            prevCell.right!,
            pad4,
          ),
        )
        // A.right connects to B's between-pad regions
        if (regionsBetweenPads) {
          ports.push(
            createPort(
              `cell_${row}_${col - 1}->cell_${row}_${col}:R-LBP12`,
              prevCell.right!,
              leftBP12!,
            ),
          )
          ports.push(
            createPort(
              `cell_${row}_${col - 1}->cell_${row}_${col}:R-LBP23`,
              prevCell.right!,
              leftBP23!,
            ),
          )
          ports.push(
            createPort(
              `cell_${row}_${col - 1}->cell_${row}_${col}:R-LBP34`,
              prevCell.right!,
              leftBP34!,
            ),
          )
        }
        // T-T connection between horizontally adjacent cells (first row only)
        // This is a vertical boundary, so use Y point count for outer edge
        if (top && prevCell.top) {
          ports.push(
            ...createMultiplePorts(
              `cell_${row}_${col - 1}->cell_${row}_${col}:T-T`,
              prevCell.top,
              top,
              effectiveOuterChannelYPoints,
            ),
          )
        }
        // B-B connection between horizontally adjacent cells
        // This is a vertical boundary; use Y points for outer edge (last row), inner points otherwise
        if (bottom && prevCell.bottom) {
          ports.push(
            ...createMultiplePorts(
              `cell_${row}_${col - 1}->cell_${row}_${col}:B-B`,
              prevCell.bottom,
              bottom,
              isLastRow
                ? effectiveOuterChannelYPoints
                : innerRowChannelPointCount,
            ),
          )
        }
      }

      // Vertical connections from cell above (A on top, current B on bottom)
      // Note: A.bottom only touches B's top row (pad1, pad8) and underjumper, not all pads
      if (row > 0) {
        const aboveCell = cells[row - 1][col]
        // A.bottom connects to B.left, B.pad1, B.underjumper, B.pad8, B.right
        if (left) {
          ports.push(
            ...createMultiplePorts(
              `cell_${row - 1}_${col}->cell_${row}_${col}:B-L`,
              aboveCell.bottom!,
              left,
              effectiveOuterChannelXPoints,
            ),
          )
        }
        ports.push(
          createPort(
            `cell_${row - 1}_${col}->cell_${row}_${col}:B-P1`,
            aboveCell.bottom!,
            pad1,
          ),
        )
        // Underjumper connections from above cell's bottom - multiple ports when regionsBetweenPads
        if (regionsBetweenPads) {
          const ujBounds = underjumper.d.bounds
          const ujWidth = ujBounds.maxX - ujBounds.minX
          const portSpacing = ujWidth / 5 // 4 ports with equal spacing

          for (let i = 1; i <= 4; i++) {
            const portX = ujBounds.minX + portSpacing * i
            const aboveUJPort: JPort = {
              portId: `cell_${row - 1}_${col}->cell_${row}_${col}:B-UJ${i}`,
              region1: aboveCell.bottom!,
              region2: underjumper,
              d: { x: portX, y: ujBounds.maxY },
            }
            aboveCell.bottom!.ports.push(aboveUJPort)
            underjumper.ports.push(aboveUJPort)
            ports.push(aboveUJPort)
          }
        } else {
          ports.push(
            createPort(
              `cell_${row - 1}_${col}->cell_${row}_${col}:B-UJ`,
              aboveCell.bottom!,
              underjumper,
            ),
          )
        }
        ports.push(
          createPort(
            `cell_${row - 1}_${col}->cell_${row}_${col}:B-P8`,
            aboveCell.bottom!,
            pad8,
          ),
        )
        ports.push(
          ...createMultiplePorts(
            `cell_${row - 1}_${col}->cell_${row}_${col}:B-R`,
            aboveCell.bottom!,
            right,
            isLastCol
              ? effectiveOuterChannelXPoints
              : innerColChannelPointCount,
          ),
        )
      }
    }
  }

  let graph: JumperGraph = { regions, ports }

  // Apply transformations based on orientation, center, and bounds
  const needsRotation = orientation === "horizontal"
  const needsCentering = center !== undefined
  const needsBoundsTransform = bounds !== undefined

  if (needsRotation || needsCentering || needsBoundsTransform) {
    // Calculate current graph bounds and center
    const currentBounds = calculateGraphBounds(graph.regions)
    const currentCenter = computeBoundsCenter(currentBounds)

    // Build transformation matrix
    const matrices = []

    // First translate to origin (current center -> origin)
    matrices.push(translate(-currentCenter.x, -currentCenter.y))

    // Apply 90-degree clockwise rotation if horizontal
    if (needsRotation) {
      matrices.push(rotate(-Math.PI / 2))
    }

    // Translate to target center
    // Priority: explicit center > bounds center > current center
    let targetCenter: { x: number; y: number }
    if (center) {
      targetCenter = center
    } else if (bounds) {
      targetCenter = computeBoundsCenter(bounds)
    } else {
      targetCenter = currentCenter
    }
    matrices.push(translate(targetCenter.x, targetCenter.y))

    const matrix = compose(...matrices)
    graph = applyTransformToGraph(graph, matrix)
  }

  return graph
}
