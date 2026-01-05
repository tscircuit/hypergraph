import type { JPort, JRegion } from "../jumper-types"
import { computeBoundsCenter } from "../geometry/getBoundsCenter"
import { dims0603 } from "./generateSingleJumperRegions"

export const generateJumperGrid = ({
  cols,
  rows,
  marginX,
  marginY,
  xChannelPointCount = 1,
  yChannelPointCount = 1,
}: {
  cols: number
  rows: number
  marginX: number
  marginY: number
  xChannelPointCount?: number
  yChannelPointCount?: number
}) => {
  const regions: JRegion[] = []
  const ports: JPort[] = []

  const { padToPad, padLength, padWidth } = dims0603
  const padHalfLength = padLength / 2
  const padHalfWidth = padWidth / 2
  const surroundSize = 0.5

  // Calculate center-to-center distances
  const horizontalSpacing = padToPad + padLength + marginX
  const verticalSpacing = padWidth + marginY

  // Store cells for later port connections
  const cells: {
    leftPad: JRegion
    rightPad: JRegion
    underjumper: JRegion
    throughjumper: JRegion
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
  const createPort = (id: string, region1: JRegion, region2: JRegion): JPort => {
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

      const leftPadCenterX = centerX - padToPad / 2
      const rightPadCenterX = centerX + padToPad / 2

      // Pad bounds
      const leftPadBounds = {
        minX: leftPadCenterX - padHalfLength,
        maxX: leftPadCenterX + padHalfLength,
        minY: centerY - padHalfWidth,
        maxY: centerY + padHalfWidth,
      }

      const rightPadBounds = {
        minX: rightPadCenterX - padHalfLength,
        maxX: rightPadCenterX + padHalfLength,
        minY: centerY - padHalfWidth,
        maxY: centerY + padHalfWidth,
      }

      const underjumperBounds = {
        minX: leftPadBounds.maxX,
        maxX: rightPadBounds.minX,
        minY: centerY - padHalfWidth,
        maxY: centerY + padHalfWidth,
      }

      // Throughjumper bounds (conductive body of the jumper, overlaps pads)
      const throughjumperHeight = 0.3
      const throughjumperBounds = {
        minX: leftPadCenterX,
        maxX: rightPadCenterX,
        minY: centerY - throughjumperHeight / 2,
        maxY: centerY + throughjumperHeight / 2,
      }

      const mainMinX = leftPadBounds.minX
      const mainMaxX = rightPadBounds.maxX
      const mainMinY = leftPadBounds.minY
      const mainMaxY = leftPadBounds.maxY

      // Create main regions
      const leftPad = createRegion(`${idPrefix}:leftPad`, leftPadBounds, true)
      const rightPad = createRegion(`${idPrefix}:rightPad`, rightPadBounds, true)
      const underjumper = createRegion(
        `${idPrefix}:underjumper`,
        underjumperBounds,
        false,
      )
      const throughjumper = createRegion(
        `${idPrefix}:throughjumper`,
        throughjumperBounds,
        false,
        true,
      )

      regions.push(leftPad, rightPad, underjumper, throughjumper)

      // Determine which frame regions to create based on grid position
      const isFirstRow = row === 0
      const isFirstCol = col === 0
      const isLastRow = row === rows - 1
      const isLastCol = col === cols - 1

      // Calculate right edge: extends to next cell's leftPad.minX, or surroundSize if last column
      let frameRightEdge: number
      if (isLastCol) {
        frameRightEdge = mainMaxX + surroundSize
      } else {
        // Next cell's leftPad.minX
        const nextCenterX = (col + 1) * horizontalSpacing
        const nextLeftPadCenterX = nextCenterX - padToPad / 2
        frameRightEdge = nextLeftPadCenterX - padHalfLength
      }

      // Top region: only for first row
      let top: JRegion | null = null
      if (isFirstRow) {
        top = createRegion(
          `${idPrefix}:T`,
          {
            minX: isFirstCol ? mainMinX - surroundSize : mainMinX,
            maxX: frameRightEdge,
            minY: mainMaxY,
            maxY: mainMaxY + surroundSize,
          },
          false,
        )
        regions.push(top)
      }

      // Bottom region: height is marginY (or surroundSize for last row)
      let bottom: JRegion | null = null
      const bottomHeight = isLastRow ? surroundSize : marginY
      bottom = createRegion(
        `${idPrefix}:B`,
        {
          minX: isFirstCol ? mainMinX - surroundSize : mainMinX,
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
            minX: mainMinX - surroundSize,
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
        leftPad,
        rightPad,
        underjumper,
        throughjumper,
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
            ...createMultiplePorts(`${idPrefix}:T-L`, top, left, xChannelPointCount),
          )
        }
        ports.push(
          ...createMultiplePorts(`${idPrefix}:T-R`, top, right, xChannelPointCount),
        )
        ports.push(createPort(`${idPrefix}:T-LP`, top, leftPad))
        ports.push(createPort(`${idPrefix}:T-RP`, top, rightPad))
        ports.push(createPort(`${idPrefix}:T-UJ`, top, underjumper))
      }

      // Bottom frame connections
      if (bottom) {
        if (left) {
          ports.push(
            ...createMultiplePorts(`${idPrefix}:B-L`, bottom, left, xChannelPointCount),
          )
        }
        ports.push(
          ...createMultiplePorts(`${idPrefix}:B-R`, bottom, right, xChannelPointCount),
        )
        ports.push(createPort(`${idPrefix}:B-LP`, bottom, leftPad))
        ports.push(createPort(`${idPrefix}:B-RP`, bottom, rightPad))
        ports.push(createPort(`${idPrefix}:B-UJ`, bottom, underjumper))
      }

      // Left/Right frame to pad connections
      if (left) {
        ports.push(createPort(`${idPrefix}:L-LP`, left, leftPad))
      }
      ports.push(createPort(`${idPrefix}:R-RP`, right, rightPad))

      // Throughjumper connections (ports at the center of each pad)
      const leftThroughPort: JPort = {
        portId: `${idPrefix}:TJ-LP`,
        region1: throughjumper,
        region2: leftPad,
        d: { x: leftPadCenterX, y: centerY },
      }
      throughjumper.ports.push(leftThroughPort)
      leftPad.ports.push(leftThroughPort)
      ports.push(leftThroughPort)

      const rightThroughPort: JPort = {
        portId: `${idPrefix}:TJ-RP`,
        region1: throughjumper,
        region2: rightPad,
        d: { x: rightPadCenterX, y: centerY },
      }
      throughjumper.ports.push(rightThroughPort)
      rightPad.ports.push(rightThroughPort)
      ports.push(rightThroughPort)

      // Horizontal connections from previous cell (A on left, current B on right)
      if (col > 0) {
        const prevCell = cells[row][col - 1]
        // A.right connects to B.leftPad
        ports.push(
          createPort(
            `cell_${row}_${col - 1}->cell_${row}_${col}:R-LP`,
            prevCell.right!,
            leftPad,
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
        // A.bottom connects to B.left, B.leftPad, B.underjumper, B.rightPad, B.right
        if (left) {
          ports.push(
            ...createMultiplePorts(
              `cell_${row - 1}_${col}->cell_${row}_${col}:B-L`,
              aboveCell.bottom!,
              left,
              xChannelPointCount,
            ),
          )
        }
        ports.push(
          createPort(
            `cell_${row - 1}_${col}->cell_${row}_${col}:B-LP`,
            aboveCell.bottom!,
            leftPad,
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
            `cell_${row - 1}_${col}->cell_${row}_${col}:B-RP`,
            aboveCell.bottom!,
            rightPad,
          ),
        )
        ports.push(
          ...createMultiplePorts(
            `cell_${row - 1}_${col}->cell_${row}_${col}:B-R`,
            aboveCell.bottom!,
            right,
            xChannelPointCount,
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
