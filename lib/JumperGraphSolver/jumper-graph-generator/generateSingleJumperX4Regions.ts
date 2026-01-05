import type { JPort, JRegion } from "../jumper-types"
import { computeBoundsCenter } from "../geometry/getBoundsCenter"

// 1206x4 resistor chip array dimensions
// This is a 4-element array with 8 pads total (4 per side)
// Layout is four resistors stacked vertically, each connecting left↔right:
//   [P1] ----TJ1---- [P8]   (row 1, Y = 1.905mm)
//   [P2] ----TJ2---- [P7]   (row 2, Y = 0.635mm)
//   [P3] ----TJ3---- [P6]   (row 3, Y = -0.635mm)
//   [P4] ----TJ4---- [P5]   (row 4, Y = -1.905mm)
// Left pads at X = -1.35mm, Right pads at X = 1.35mm
// CCW pin numbering: pins 1-4 on left (top to bottom), pins 5-8 on right (bottom to top)
export const dims1206x4 = {
  padWidth: 0.8, // X direction (horizontal)
  padHeight: 0.5, // Y direction (vertical)
  leftPadCenterX: -1.35, // X position of left pads (P1, P2, P3, P4)
  rightPadCenterX: 1.35, // X position of right pads (P5, P6, P7, P8)
  row1CenterY: 1.905, // Y position of row 1 (P1, P8)
  row2CenterY: 0.635, // Y position of row 2 (P2, P7)
  row3CenterY: -0.635, // Y position of row 3 (P3, P6)
  row4CenterY: -1.905, // Y position of row 4 (P4, P5)
}

export const generateSingleJumperX4Regions = ({
  center,
  idPrefix,
  regionsBetweenPads = false,
}: {
  center: { x: number; y: number }
  idPrefix: string
  regionsBetweenPads?: boolean
}) => {
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

  // Absolute pad center positions
  // Left side pads (pins 1-4, top to bottom)
  const p1CenterX = center.x + leftPadCenterX
  const p1CenterY = center.y + row1CenterY

  const p2CenterX = center.x + leftPadCenterX
  const p2CenterY = center.y + row2CenterY

  const p3CenterX = center.x + leftPadCenterX
  const p3CenterY = center.y + row3CenterY

  const p4CenterX = center.x + leftPadCenterX
  const p4CenterY = center.y + row4CenterY

  // Right side pads (pins 5-8, bottom to top - CCW numbering)
  const p5CenterX = center.x + rightPadCenterX
  const p5CenterY = center.y + row4CenterY // bottom row

  const p6CenterX = center.x + rightPadCenterX
  const p6CenterY = center.y + row3CenterY

  const p7CenterX = center.x + rightPadCenterX
  const p7CenterY = center.y + row2CenterY

  const p8CenterX = center.x + rightPadCenterX
  const p8CenterY = center.y + row1CenterY // top row

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
  // NO ports connect this to pads
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

  // Surrounding region thickness
  const surroundSize = 0.5

  // The full extent of all main regions
  const mainMinX = pad1Bounds.minX
  const mainMaxX = pad8Bounds.maxX
  const mainMinY = pad4Bounds.minY // bottom row
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
  const pad5 = createRegion("pad5", pad5Bounds, true)
  const pad6 = createRegion("pad6", pad6Bounds, true)
  const pad7 = createRegion("pad7", pad7Bounds, true)
  const pad8 = createRegion("pad8", pad8Bounds, true)

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
  const throughjumper3 = createRegion(
    "throughjumper3",
    throughjumper3Bounds,
    false,
    true,
  )
  const throughjumper4 = createRegion(
    "throughjumper4",
    throughjumper4Bounds,
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

  // Between-pad regions (created when regionsBetweenPads is true)
  // Left side: between P1-P2, P2-P3, P3-P4
  // Right side: between P8-P7, P7-P6, P6-P5
  let leftBP12: JRegion | undefined
  let leftBP23: JRegion | undefined
  let leftBP34: JRegion | undefined
  let rightBP87: JRegion | undefined
  let rightBP76: JRegion | undefined
  let rightBP65: JRegion | undefined

  if (regionsBetweenPads) {
    // Left side between-pad regions
    leftBP12 = createRegion(
      "L-BP12",
      {
        minX: pad1Bounds.minX,
        maxX: pad1Bounds.maxX,
        minY: pad2Bounds.maxY,
        maxY: pad1Bounds.minY,
      },
      false,
    )
    leftBP23 = createRegion(
      "L-BP23",
      {
        minX: pad2Bounds.minX,
        maxX: pad2Bounds.maxX,
        minY: pad3Bounds.maxY,
        maxY: pad2Bounds.minY,
      },
      false,
    )
    leftBP34 = createRegion(
      "L-BP34",
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
      "R-BP87",
      {
        minX: pad8Bounds.minX,
        maxX: pad8Bounds.maxX,
        minY: pad7Bounds.maxY,
        maxY: pad8Bounds.minY,
      },
      false,
    )
    rightBP76 = createRegion(
      "R-BP76",
      {
        minX: pad7Bounds.minX,
        maxX: pad7Bounds.maxX,
        minY: pad6Bounds.maxY,
        maxY: pad7Bounds.minY,
      },
      false,
    )
    rightBP65 = createRegion(
      "R-BP65",
      {
        minX: pad6Bounds.minX,
        maxX: pad6Bounds.maxX,
        minY: pad5Bounds.maxY,
        maxY: pad6Bounds.minY,
      },
      false,
    )
  }

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
    top,
    bottom,
    left,
    right,
  )

  if (regionsBetweenPads) {
    regions.push(
      leftBP12!,
      leftBP23!,
      leftBP34!,
      rightBP87!,
      rightBP76!,
      rightBP65!,
    )
  }

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

  // Left side pads (P1-P4) - connections to surrounding regions
  ports.push(createPort("T-P1", top, pad1))
  ports.push(createPort("L-P1", left, pad1))
  ports.push(createPort("L-P2", left, pad2))
  ports.push(createPort("L-P3", left, pad3))
  ports.push(createPort("L-P4", left, pad4))
  ports.push(createPort("B-P4", bottom, pad4))

  // Right side pads (P5-P8) - connections to surrounding regions
  ports.push(createPort("B-P5", bottom, pad5))
  ports.push(createPort("R-P5", right, pad5))
  ports.push(createPort("R-P6", right, pad6))
  ports.push(createPort("R-P7", right, pad7))
  ports.push(createPort("R-P8", right, pad8))
  ports.push(createPort("T-P8", top, pad8))

  // Underjumper connections to top/bottom only - NO ports to pads!
  if (regionsBetweenPads) {
    // Create 4 ports at top and 4 ports at bottom of underjumper
    const ujBounds = underjumper.d.bounds
    const ujWidth = ujBounds.maxX - ujBounds.minX
    const portSpacing = ujWidth / 5 // 4 ports with equal spacing

    for (let i = 1; i <= 4; i++) {
      const portX = ujBounds.minX + portSpacing * i

      // Top ports
      const topPort: JPort = {
        portId: `${idPrefix}:T-UJ${i}`,
        region1: top,
        region2: underjumper,
        d: { x: portX, y: ujBounds.maxY },
      }
      top.ports.push(topPort)
      underjumper.ports.push(topPort)
      ports.push(topPort)

      // Bottom ports
      const bottomPort: JPort = {
        portId: `${idPrefix}:B-UJ${i}`,
        region1: bottom,
        region2: underjumper,
        d: { x: portX, y: ujBounds.minY },
      }
      bottom.ports.push(bottomPort)
      underjumper.ports.push(bottomPort)
      ports.push(bottomPort)
    }

    // Between-pad region ports - each connects to left/right side and underjumper
    // Left side between-pad regions
    const createBetweenPadPorts = (
      bpRegion: JRegion,
      sideRegion: JRegion,
      sideId: string,
      ujId: string,
    ) => {
      // Port to side (left or right)
      ports.push(createPort(sideId, sideRegion, bpRegion))
      // Port to underjumper
      ports.push(createPort(ujId, bpRegion, underjumper))
    }

    createBetweenPadPorts(leftBP12!, left, "L-BP12", "UJ-LBP12")
    createBetweenPadPorts(leftBP23!, left, "L-BP23", "UJ-LBP23")
    createBetweenPadPorts(leftBP34!, left, "L-BP34", "UJ-LBP34")
    createBetweenPadPorts(rightBP87!, right, "R-BP87", "UJ-RBP87")
    createBetweenPadPorts(rightBP76!, right, "R-BP76", "UJ-RBP76")
    createBetweenPadPorts(rightBP65!, right, "R-BP65", "UJ-RBP65")
  } else {
    ports.push(createPort("T-UJ", top, underjumper))
    ports.push(createPort("B-UJ", bottom, underjumper))
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

  return {
    regions,
    ports,
  }
}
