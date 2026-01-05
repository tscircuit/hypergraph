import type { JPort, JRegion } from "../jumper-types"
import { dims0603 } from "./generateSingleJumperRegions"

export const generateJumperGrid = ({
  cols,
  rows,
  marginX,
  marginY,
}: {
  cols: number
  rows: number
  marginX: number
  marginY: number
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
    d: { bounds, isPad, isThroughJumper },
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

      // Top region: only for first row
      let top: JRegion | null = null
      if (isFirstRow) {
        top = createRegion(
          `${idPrefix}:T`,
          {
            minX: isFirstCol ? mainMinX - surroundSize : mainMinX,
            maxX: mainMaxX + surroundSize,
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
          maxX: mainMaxX + surroundSize,
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
          maxX: mainMaxX + surroundSize,
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
          ports.push(createPort(`${idPrefix}:T-L`, top, left))
        }
        ports.push(createPort(`${idPrefix}:T-R`, top, right))
        ports.push(createPort(`${idPrefix}:T-LP`, top, leftPad))
        ports.push(createPort(`${idPrefix}:T-RP`, top, rightPad))
        ports.push(createPort(`${idPrefix}:T-UJ`, top, underjumper))
      }

      // Bottom frame connections
      if (bottom) {
        if (left) {
          ports.push(createPort(`${idPrefix}:B-L`, bottom, left))
        }
        ports.push(createPort(`${idPrefix}:B-R`, bottom, right))
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
        // A.right connects to B.underjumper (they share edge at leftPad.minX)
        // But actually underjumper starts at leftPad.maxX, so no direct connection
        // A.right connects to B.top (if exists) - but B.top is shrunk, so check adjacency
        if (top) {
          // A.right.maxX should equal B.top.minX for adjacency
          // A.right.maxX = prevCell.right.d.bounds.maxX
          // B.top.minX = mainMinX (since we're not first col)
          // These should be adjacent if spacing is correct
          ports.push(
            createPort(
              `cell_${row}_${col - 1}->cell_${row}_${col}:R-T`,
              prevCell.right!,
              top,
            ),
          )
        }
        if (bottom) {
          ports.push(
            createPort(
              `cell_${row}_${col - 1}->cell_${row}_${col}:R-B`,
              prevCell.right!,
              bottom,
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
            createPort(
              `cell_${row - 1}_${col}->cell_${row}_${col}:B-L`,
              aboveCell.bottom!,
              left,
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
          createPort(
            `cell_${row - 1}_${col}->cell_${row}_${col}:B-R`,
            aboveCell.bottom!,
            right,
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
