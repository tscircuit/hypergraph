import type { JPort, JRegion } from "../jumper-types"
import { computeBoundsCenter } from "../geometry/getBoundsCenter"
import { dims0606x2 } from "./generateSingleJumperX2Regions"

export const generateJumperX2Grid = ({
  cols,
  rows,
  marginX,
  marginY,
  xChannelPointCount = 1,
  yChannelPointCount = 1,
  outerPaddingX = 0.5,
  outerPaddingY = 0.5,
  outerChannelXPoints,
  outerChannelYPoints,
}: {
  cols: number
  rows: number
  marginX: number
  marginY: number
  xChannelPointCount?: number
  yChannelPointCount?: number
  outerPaddingX?: number
  outerPaddingY?: number
  outerChannelXPoints?: number
  outerChannelYPoints?: number
}) => {
  // Calculate outer channel points: use provided value or derive from outer padding
  const effectiveOuterChannelXPoints =
    outerChannelXPoints ?? Math.max(1, Math.floor(outerPaddingX / 0.4))
  const effectiveOuterChannelYPoints =
    outerChannelYPoints ?? Math.max(1, Math.floor(outerPaddingY / 0.4))

  const regions: JRegion[] = []
  const ports: JPort[] = []

  const {
    padWidth,
    padHeight,
    leftPadCenterX,
    rightPadCenterX,
    topRowCenterY,
    bottomRowCenterY,
  } = dims0606x2

  const padHalfWidth = padWidth / 2
  const padHalfHeight = padHeight / 2

  // Calculate center-to-center distances for the grid
  // Horizontal spacing: from one cell center to next cell center
  const cellWidth = rightPadCenterX - leftPadCenterX + padWidth // total width of pads region
  const horizontalSpacing = cellWidth + marginX

  // Vertical spacing: from one cell center to next cell center
  const cellHeight = topRowCenterY - bottomRowCenterY + padHeight // total height of pads region
  const verticalSpacing = cellHeight + marginY

  // Store cells for later port connections
  const cells: {
    pad1: JRegion
    pad2: JRegion
    pad3: JRegion
    pad4: JRegion
    underjumper: JRegion
    throughjumper1: JRegion
    throughjumper2: JRegion
    top: JRegion | null
    bottom: JRegion | null
    left: JRegion | null
    right: JRegion | null
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
      const p1CenterX = centerX + leftPadCenterX
      const p1CenterY = centerY + topRowCenterY
      const p2CenterX = centerX + leftPadCenterX
      const p2CenterY = centerY + bottomRowCenterY
      const p3CenterX = centerX + rightPadCenterX
      const p3CenterY = centerY + topRowCenterY
      const p4CenterX = centerX + rightPadCenterX
      const p4CenterY = centerY + bottomRowCenterY

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

      // Underjumper region - single vertical region in the center between left and right pads
      const underjumperBounds = {
        minX: pad1Bounds.maxX,
        maxX: pad3Bounds.minX,
        minY: pad2Bounds.minY,
        maxY: pad1Bounds.maxY,
      }

      // Throughjumper regions (conductive body of each resistor)
      const throughjumperHeight = 0.3
      const throughjumper1Bounds = {
        minX: p1CenterX,
        maxX: p3CenterX,
        minY: p1CenterY - throughjumperHeight / 2,
        maxY: p1CenterY + throughjumperHeight / 2,
      }
      const throughjumper2Bounds = {
        minX: p2CenterX,
        maxX: p4CenterX,
        minY: p2CenterY - throughjumperHeight / 2,
        maxY: p2CenterY + throughjumperHeight / 2,
      }

      // The full extent of main regions for this cell
      const mainMinX = pad1Bounds.minX
      const mainMaxX = pad3Bounds.maxX
      const mainMinY = pad2Bounds.minY
      const mainMaxY = pad1Bounds.maxY

      // Create main regions
      const pad1 = createRegion(`${idPrefix}:pad1`, pad1Bounds, true)
      const pad2 = createRegion(`${idPrefix}:pad2`, pad2Bounds, true)
      const pad3 = createRegion(`${idPrefix}:pad3`, pad3Bounds, true)
      const pad4 = createRegion(`${idPrefix}:pad4`, pad4Bounds, true)
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

      regions.push(
        pad1,
        pad2,
        pad3,
        pad4,
        underjumper,
        throughjumper1,
        throughjumper2,
      )

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
        underjumper,
        throughjumper1,
        throughjumper2,
        top,
        bottom,
        left,
        right,
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
            effectiveOuterChannelXPoints,
          ),
        )
        // Top connects to pad1, pad3, and underjumper
        ports.push(createPort(`${idPrefix}:T-P1`, top, pad1))
        ports.push(createPort(`${idPrefix}:T-P3`, top, pad3))
        ports.push(createPort(`${idPrefix}:T-UJ`, top, underjumper))
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
            effectiveOuterChannelXPoints,
          ),
        )
        // Bottom connects to pad2, pad4, and underjumper
        ports.push(createPort(`${idPrefix}:B-P2`, bottom, pad2))
        ports.push(createPort(`${idPrefix}:B-P4`, bottom, pad4))
        ports.push(createPort(`${idPrefix}:B-UJ`, bottom, underjumper))
      }

      // Left/Right frame to pad connections
      if (left) {
        ports.push(createPort(`${idPrefix}:L-P1`, left, pad1))
        ports.push(createPort(`${idPrefix}:L-P2`, left, pad2))
      }
      ports.push(createPort(`${idPrefix}:R-P3`, right, pad3))
      ports.push(createPort(`${idPrefix}:R-P4`, right, pad4))

      // Throughjumper1 connections (ports at the center of each pad in top row)
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
        portId: `${idPrefix}:TJ1-P3`,
        region1: throughjumper1,
        region2: pad3,
        d: { x: p3CenterX, y: p3CenterY },
      }
      throughjumper1.ports.push(tj1RightPort)
      pad3.ports.push(tj1RightPort)
      ports.push(tj1RightPort)

      // Throughjumper2 connections (ports at the center of each pad in bottom row)
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
        portId: `${idPrefix}:TJ2-P4`,
        region1: throughjumper2,
        region2: pad4,
        d: { x: p4CenterX, y: p4CenterY },
      }
      throughjumper2.ports.push(tj2RightPort)
      pad4.ports.push(tj2RightPort)
      ports.push(tj2RightPort)

      // Horizontal connections from previous cell (A on left, current B on right)
      if (col > 0) {
        const prevCell = cells[row][col - 1]
        // A.right connects to B.pad1 and B.pad2
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
        // T-T connection between horizontally adjacent cells (first row only)
        if (top && prevCell.top) {
          ports.push(
            ...createMultiplePorts(
              `cell_${row}_${col - 1}->cell_${row}_${col}:T-T`,
              prevCell.top,
              top,
              yChannelPointCount,
            ),
          )
        }
        // B-B connection between horizontally adjacent cells
        if (bottom && prevCell.bottom) {
          ports.push(
            ...createMultiplePorts(
              `cell_${row}_${col - 1}->cell_${row}_${col}:B-B`,
              prevCell.bottom,
              bottom,
              yChannelPointCount,
            ),
          )
        }
      }

      // Vertical connections from cell above (A on top, current B on bottom)
      if (row > 0) {
        const aboveCell = cells[row - 1][col]
        // A.bottom connects to B.left, B.pad1, B.pad2, B.underjumper, B.pad3, B.pad4, B.right
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
        ports.push(
          createPort(
            `cell_${row - 1}_${col}->cell_${row}_${col}:B-P2`,
            aboveCell.bottom!,
            pad2,
          ),
        )
        ports.push(
          createPort(
            `cell_${row - 1}_${col}->cell_${row}_${col}:B-UJ`,
            aboveCell.bottom!,
            underjumper,
          ),
        )
        ports.push(
          createPort(
            `cell_${row - 1}_${col}->cell_${row}_${col}:B-P3`,
            aboveCell.bottom!,
            pad3,
          ),
        )
        ports.push(
          createPort(
            `cell_${row - 1}_${col}->cell_${row}_${col}:B-P4`,
            aboveCell.bottom!,
            pad4,
          ),
        )
        ports.push(
          ...createMultiplePorts(
            `cell_${row - 1}_${col}->cell_${row}_${col}:B-R`,
            aboveCell.bottom!,
            right,
            effectiveOuterChannelXPoints,
          ),
        )
      }
    }
  }

  return {
    regions,
    ports,
  }
}
