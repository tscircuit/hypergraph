import type { JPort, JRegion } from "../jumper-types"
import { computeBoundsCenter } from "../geometry/getBoundsCenter"

// 0606x2 resistor chip array dimensions
// This is a 2-element array with 4 pads total (2 per resistor)
// Layout is two resistors stacked vertically, each connecting left↔right:
//   [P1] ----TJ1---- [P3]   (top row, Y = 0.40mm)
//   [P2] ----TJ2---- [P4]   (bottom row, Y = -0.40mm)
// Left pads at X = -0.725mm, Right pads at X = 0.725mm
export const dims0606x2 = {
  padWidth: 0.8, // X direction (horizontal)
  padHeight: 0.45, // Y direction (vertical)
  leftPadCenterX: -0.725, // X position of left pads (P1, P2)
  rightPadCenterX: 0.725, // X position of right pads (P3, P4)
  topRowCenterY: 0.4, // Y position of top row (P1, P3)
  bottomRowCenterY: -0.4, // Y position of bottom row (P2, P4)
}

export const generateSingleJumperX2Regions = ({
  center,
  idPrefix,
}: {
  center: { x: number; y: number }
  idPrefix: string
}) => {
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

  // Absolute pad center positions
  const p1CenterX = center.x + leftPadCenterX
  const p1CenterY = center.y + topRowCenterY

  const p2CenterX = center.x + leftPadCenterX
  const p2CenterY = center.y + bottomRowCenterY

  const p3CenterX = center.x + rightPadCenterX
  const p3CenterY = center.y + topRowCenterY

  const p4CenterX = center.x + rightPadCenterX
  const p4CenterY = center.y + bottomRowCenterY

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
  // NO ports connect this to pads
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

  // Surrounding region thickness
  const surroundSize = 0.5

  // The full extent of all main regions
  const mainMinX = pad1Bounds.minX
  const mainMaxX = pad3Bounds.maxX
  const mainMinY = pad2Bounds.minY // bottom row
  const mainMaxY = pad1Bounds.maxY // top row

  // Helper to create a region
  const createRegion = (
    id: string,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    isPad: boolean,
    isThroughJumper?: boolean,
  ): JRegion => ({
    regionId: `${idPrefix}:${id}`,
    ports: [],
    d: { bounds, center: computeBoundsCenter(bounds), isPad, isThroughJumper },
  })

  // Create pad regions
  const pad1 = createRegion("pad1", pad1Bounds, true)
  const pad2 = createRegion("pad2", pad2Bounds, true)
  const pad3 = createRegion("pad3", pad3Bounds, true)
  const pad4 = createRegion("pad4", pad4Bounds, true)

  // Create underjumper region (no ports to pads!)
  const underjumper = createRegion("underjumper", underjumperBounds, false)

  // Create throughjumper regions
  const throughjumper1 = createRegion(
    "throughjumper1",
    throughjumper1Bounds,
    false,
    true,
  )
  const throughjumper2 = createRegion(
    "throughjumper2",
    throughjumper2Bounds,
    false,
    true,
  )

  // Create surrounding regions
  const top = createRegion(
    "T",
    {
      minX: mainMinX - surroundSize,
      maxX: mainMaxX + surroundSize,
      minY: mainMaxY,
      maxY: mainMaxY + surroundSize,
    },
    false,
  )

  const bottom = createRegion(
    "B",
    {
      minX: mainMinX - surroundSize,
      maxX: mainMaxX + surroundSize,
      minY: mainMinY - surroundSize,
      maxY: mainMinY,
    },
    false,
  )

  const left = createRegion(
    "L",
    {
      minX: mainMinX - surroundSize,
      maxX: mainMinX,
      minY: mainMinY,
      maxY: mainMaxY,
    },
    false,
  )

  const right = createRegion(
    "R",
    {
      minX: mainMaxX,
      maxX: mainMaxX + surroundSize,
      minY: mainMinY,
      maxY: mainMaxY,
    },
    false,
  )

  regions.push(
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
  )

  // Helper to create a port at the boundary between two regions
  const createPort = (
    id: string,
    region1: JRegion,
    region2: JRegion,
  ): JPort => {
    const b1 = region1.d.bounds
    const b2 = region2.d.bounds

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
      portId: `${idPrefix}:${id}`,
      region1,
      region2,
      d: { x, y },
    }
    region1.ports.push(port)
    region2.ports.push(port)
    return port
  }

  // Surrounding frame corner connections
  ports.push(createPort("T-L", top, left))
  ports.push(createPort("T-R", top, right))
  ports.push(createPort("B-L", bottom, left))
  ports.push(createPort("B-R", bottom, right))

  // Top row pads (P1 left, P3 right) - connections to surrounding regions
  ports.push(createPort("T-P1", top, pad1))
  ports.push(createPort("L-P1", left, pad1))
  ports.push(createPort("T-P3", top, pad3))
  ports.push(createPort("R-P3", right, pad3))

  // Bottom row pads (P2 left, P4 right) - connections to surrounding regions
  ports.push(createPort("B-P2", bottom, pad2))
  ports.push(createPort("L-P2", left, pad2))
  ports.push(createPort("B-P4", bottom, pad4))
  ports.push(createPort("R-P4", right, pad4))

  // Underjumper connections to top/bottom only - NO ports to pads!
  ports.push(createPort("T-UJ", top, underjumper))
  ports.push(createPort("B-UJ", bottom, underjumper))

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

  return {
    regions,
    ports,
  }
}
