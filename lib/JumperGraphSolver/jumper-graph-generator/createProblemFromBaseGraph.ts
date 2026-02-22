import { distance } from "@tscircuit/math-utils"
import type { JumperGraph } from "../jumper-types"
import { chordsCross, perimeterT } from "../perimeterChordUtils"
import { calculateGraphBounds } from "./calculateGraphBounds"
import {
  createGraphWithConnectionsFromBaseGraph,
  type JumperGraphWithConnections,
  type XYConnection,
} from "./createGraphWithConnectionsFromBaseGraph"
import { findBoundaryRegion } from "./findBoundaryRegion"

/**
 * Simple seeded random number generator (Linear Congruential Generator)
 */
const createSeededRandom = (seed: number) => {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

/**
 * Counts the number of crossings between connections using perimeter chord method.
 */
const countCrossings = (
  connections: XYConnection[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): number => {
  const { minX, maxX, minY, maxY } = bounds
  const perimeter = 2 * (maxX - minX) + 2 * (maxY - minY)

  // Convert each connection to a chord (pair of perimeter T values)
  const chords: [number, number][] = connections.map((conn) => [
    perimeterT(conn.start, minX, maxX, minY, maxY),
    perimeterT(conn.end, minX, maxX, minY, maxY),
  ])

  let crossings = 0
  for (let i = 0; i < chords.length; i++) {
    for (let j = i + 1; j < chords.length; j++) {
      if (chordsCross(chords[i], chords[j], perimeter)) {
        crossings++
      }
    }
  }
  return crossings
}

const MIN_POINT_DISTANCE = 0.4
const MAX_BOUNDARY_SNAP_DISTANCE = 1e-3

/**
 * Checks if a point is at least MIN_POINT_DISTANCE away from all existing points.
 */
const isValidPoint = (
  point: { x: number; y: number },
  existingPoints: { x: number; y: number }[],
): boolean => {
  for (const existing of existingPoints) {
    if (distance(point, existing) < MIN_POINT_DISTANCE) {
      return false
    }
  }
  return true
}

const getValidatedBoundaryPoint = (
  point: { x: number; y: number },
  baseGraph: JumperGraph,
  graphBounds: { minX: number; maxX: number; minY: number; maxY: number },
): { x: number; y: number } | null => {
  const boundary = findBoundaryRegion(
    point.x,
    point.y,
    baseGraph.regions,
    graphBounds,
  )

  if (!boundary) return null

  const snappedPoint = boundary.portPosition
  if (distance(point, snappedPoint) > MAX_BOUNDARY_SNAP_DISTANCE) {
    return null
  }

  return snappedPoint
}

type Side = "top" | "right" | "bottom" | "left"

/**
 * Generates a random point on a specific side of the bounds
 */
const getPointOnSide = (
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  side: Side,
  t: number, // 0-1 position along the side
): { x: number; y: number } => {
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY

  switch (side) {
    case "top":
      return { x: bounds.minX + t * width, y: bounds.maxY }
    case "right":
      return { x: bounds.maxX, y: bounds.maxY - t * height }
    case "bottom":
      return { x: bounds.maxX - t * width, y: bounds.minY }
    case "left":
      return { x: bounds.minX, y: bounds.minY + t * height }
  }
}

/**
 * Returns the length of a side
 */
const getSideLength = (
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  side: Side,
): number => {
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  return side === "top" || side === "bottom" ? width : height
}

/**
 * Generates a random point on the perimeter of the given bounds
 * If allowedSides is provided, only generates points on those sides
 */
const getRandomPerimeterPoint = (
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  random: () => number,
  allowedSides?: Side[],
): { x: number; y: number } => {
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY

  if (allowedSides && allowedSides.length > 0) {
    // Calculate total length of allowed sides
    const sideLengths = allowedSides.map((side) => getSideLength(bounds, side))
    const totalLength = sideLengths.reduce((sum, len) => sum + len, 0)

    // Pick a random position along the combined length
    let pos = random() * totalLength

    for (let i = 0; i < allowedSides.length; i++) {
      if (pos < sideLengths[i]) {
        const t = pos / sideLengths[i]
        return getPointOnSide(bounds, allowedSides[i], t)
      }
      pos -= sideLengths[i]
    }

    // Fallback to last side (shouldn't happen due to floating point)
    return getPointOnSide(
      bounds,
      allowedSides[allowedSides.length - 1],
      random(),
    )
  }

  const perimeter = 2 * width + 2 * height

  // Pick a random position along the perimeter
  const pos = random() * perimeter

  if (pos < width) {
    // Top edge
    return { x: bounds.minX + pos, y: bounds.maxY }
  }
  if (pos < width + height) {
    // Right edge
    return { x: bounds.maxX, y: bounds.maxY - (pos - width) }
  }
  if (pos < 2 * width + height) {
    // Bottom edge
    return { x: bounds.maxX - (pos - width - height), y: bounds.minY }
  }
  // Left edge
  return { x: bounds.minX, y: bounds.minY + (pos - 2 * width - height) }
}

const ALL_SIDES: Side[] = ["top", "right", "bottom", "left"]

/**
 * Picks two random different sides
 */
const pickTwoRandomSides = (random: () => number): [Side, Side] => {
  const firstIndex = Math.floor(random() * 4)
  let secondIndex = Math.floor(random() * 3)
  if (secondIndex >= firstIndex) {
    secondIndex++
  }
  return [ALL_SIDES[firstIndex], ALL_SIDES[secondIndex]]
}

/**
 * Generates a connection ID from an index (0 -> "A", 1 -> "B", etc.)
 */
const getConnectionId = (index: number): string => {
  return String.fromCharCode(65 + index) // 65 is ASCII for 'A'
}

export type CreateProblemFromBaseGraphParams = {
  baseGraph: JumperGraph
  numCrossings: number
  randomSeed: number
  twoSided?: boolean
}

/**
 * Creates a problem graph from a base graph by generating random connection
 * positions on the perimeter/bounds of the graph. Regenerates positions until
 * the required number of crossings is achieved.
 */
export const createProblemFromBaseGraph = ({
  baseGraph,
  numCrossings,
  randomSeed,
  twoSided = false,
}: CreateProblemFromBaseGraphParams): JumperGraphWithConnections => {
  const random = createSeededRandom(randomSeed)
  const graphBounds = calculateGraphBounds(baseGraph.regions)

  // If twoSided, pick two random sides to use for all points in this problem
  const allowedSides = twoSided ? pickTwoRandomSides(random) : undefined

  // Start with minimum connections needed for the desired crossings
  // For n connections, max crossings is n*(n-1)/2, so we need at least
  // ceil((1 + sqrt(1 + 8*numCrossings)) / 2) connections
  const minConnections = Math.ceil((1 + Math.sqrt(1 + 8 * numCrossings)) / 2)
  let numConnections = Math.max(2, minConnections)

  const maxAttempts = 10000
  let attempts = 0

  while (attempts < maxAttempts) {
    const xyConnections: XYConnection[] = []
    const allPoints: { x: number; y: number }[] = []
    let validGeneration = true

    for (let i = 0; i < numConnections; i++) {
      // Try to find a valid start point
      let start: { x: number; y: number } | null = null
      for (let tryCount = 0; tryCount < 100; tryCount++) {
        const candidate = getRandomPerimeterPoint(
          graphBounds,
          random,
          allowedSides,
        )
        const snappedCandidate = getValidatedBoundaryPoint(
          candidate,
          baseGraph,
          graphBounds,
        )
        if (snappedCandidate && isValidPoint(snappedCandidate, allPoints)) {
          start = snappedCandidate
          break
        }
      }
      if (!start) {
        validGeneration = false
        break
      }
      allPoints.push(start)

      // Try to find a valid end point
      let end: { x: number; y: number } | null = null
      for (let tryCount = 0; tryCount < 100; tryCount++) {
        const candidate = getRandomPerimeterPoint(
          graphBounds,
          random,
          allowedSides,
        )
        const snappedCandidate = getValidatedBoundaryPoint(
          candidate,
          baseGraph,
          graphBounds,
        )
        if (snappedCandidate && isValidPoint(snappedCandidate, allPoints)) {
          end = snappedCandidate
          break
        }
      }
      if (!end) {
        validGeneration = false
        break
      }
      allPoints.push(end)

      xyConnections.push({
        start,
        end,
        connectionId: getConnectionId(i),
      })
    }

    if (!validGeneration) {
      attempts++
      continue
    }

    const actualCrossings = countCrossings(xyConnections, graphBounds)

    if (actualCrossings === numCrossings) {
      return createGraphWithConnectionsFromBaseGraph(baseGraph, xyConnections)
    }

    // If we exceed the number of crossings, start over
    if (actualCrossings > numCrossings) {
      attempts++
      continue
    }

    attempts++

    // If we consistently get too few crossings, try adding more connections
    if (attempts % 100 === 0 && actualCrossings < numCrossings) {
      numConnections++
    }
  }

  throw new Error(
    `Failed to generate graph with exactly ${numCrossings} crossings after ${maxAttempts} attempts`,
  )
}
