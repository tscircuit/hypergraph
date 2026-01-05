import type { JPort, JRegion } from "../jumper-types"
import { computeBoundsCenter } from "../geometry/getBoundsCenter"

export const dims0603 = {
  padToPad: 1.65,
  padLength: 0.8,
  padWidth: 0.95,
}

// There are two pads, each pad is a region. Each pad has 3 ports
// that are on the outer edges
// There is a region between the two pads (the underjumper region)
// that does not have ports to the pads (because using the pads and
// underjumper is a of jumper)
// There are then 13 regions surrounding all these regions along
// the tops and edges
// for a total of 16 regions/jumper
// General regions have points that connect the regions on the edge
// of each region they're adjacent to (but not diagonal from)

export const generateSingleJumperRegions = ({
  center,
  idPrefix,
}: {
  center: { x: number; y: number }
  idPrefix: string
}) => {
  const regions: JRegion[] = []
  const ports: JPort[] = []

  const { padToPad, padLength, padWidth } = dims0603

  // Pad centers
  const leftPadCenterX = center.x - padToPad / 2
  const rightPadCenterX = center.x + padToPad / 2

  const padHalfLength = padLength / 2
  const padHalfWidth = padWidth / 2

  // Left pad bounds
  const leftPadBounds = {
    minX: leftPadCenterX - padHalfLength,
    maxX: leftPadCenterX + padHalfLength,
    minY: center.y - padHalfWidth,
    maxY: center.y + padHalfWidth,
  }

  // Right pad bounds
  const rightPadBounds = {
    minX: rightPadCenterX - padHalfLength,
    maxX: rightPadCenterX + padHalfLength,
    minY: center.y - padHalfWidth,
    maxY: center.y + padHalfWidth,
  }

  // Underjumper bounds (between the pads)
  const underjumperBounds = {
    minX: leftPadBounds.maxX,
    maxX: rightPadBounds.minX,
    minY: center.y - padHalfWidth,
    maxY: center.y + padHalfWidth,
  }

  // Surrounding region thickness
  const surroundSize = 0.5

  // The full extent of all main regions (pads + underjumper)
  const mainMinX = leftPadBounds.minX
  const mainMaxX = rightPadBounds.maxX
  const mainMinY = leftPadBounds.minY
  const mainMaxY = leftPadBounds.maxY

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

  // Create main regions (pads and underjumper)
  const leftPad = createRegion("leftPad", leftPadBounds, true)
  const rightPad = createRegion("rightPad", rightPadBounds, true)
  const underjumper = createRegion("underjumper", underjumperBounds, false)

  // Throughjumper region (conductive body of the jumper, overlaps pads)
  const throughjumperHeight = 0.3
  const throughjumperBounds = {
    minX: leftPadCenterX,
    maxX: rightPadCenterX,
    minY: center.y - throughjumperHeight / 2,
    maxY: center.y + throughjumperHeight / 2,
  }
  const throughjumper = createRegion(
    "throughjumper",
    throughjumperBounds,
    false,
    true,
  )

  // Create surrounding regions as a frame around the main regions
  // Top strip (full width above main regions)
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

  // Bottom strip (full width below main regions)
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

  // Left strip (between top and bottom)
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

  // Right strip (between top and bottom)
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
    leftPad,
    rightPad,
    underjumper,
    throughjumper,
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
      portId: `${idPrefix}:${id}`,
      region1,
      region2,
      d: { x, y },
    }
    region1.ports.push(port)
    region2.ports.push(port)
    return port
  }

  // Surrounding frame connections
  ports.push(createPort("T-L", top, left))
  ports.push(createPort("T-R", top, right))
  ports.push(createPort("B-L", bottom, left))
  ports.push(createPort("B-R", bottom, right))

  // Left pad connections (3 outer ports: top, left, bottom)
  ports.push(createPort("T-LP", top, leftPad))
  ports.push(createPort("L-LP", left, leftPad))
  ports.push(createPort("B-LP", bottom, leftPad))

  // Right pad connections (3 outer ports: top, right, bottom)
  ports.push(createPort("T-RP", top, rightPad))
  ports.push(createPort("R-RP", right, rightPad))
  ports.push(createPort("B-RP", bottom, rightPad))

  // Underjumper connections (top and bottom only - NO ports to pads!)
  ports.push(createPort("T-UJ", top, underjumper))
  ports.push(createPort("B-UJ", bottom, underjumper))

  // Throughjumper connections (ports at the center of each pad)
  const leftThroughPort: JPort = {
    portId: `${idPrefix}:TJ-LP`,
    region1: throughjumper,
    region2: leftPad,
    d: { x: leftPadCenterX, y: center.y },
  }
  throughjumper.ports.push(leftThroughPort)
  leftPad.ports.push(leftThroughPort)
  ports.push(leftThroughPort)

  const rightThroughPort: JPort = {
    portId: `${idPrefix}:TJ-RP`,
    region1: throughjumper,
    region2: rightPad,
    d: { x: rightPadCenterX, y: center.y },
  }
  throughjumper.ports.push(rightThroughPort)
  rightPad.ports.push(rightThroughPort)
  ports.push(rightThroughPort)

  return {
    regions,
    ports,
  }
}
