import type { JumperGraph } from "../jumper-types"
import { perimeterT, chordsCross } from "../perimeterChordUtils"
import { calculateGraphBounds } from "./calculateGraphBounds"
import {
  createGraphWithConnectionsFromBaseGraph,
  type JumperGraphWithConnections,
  type XYConnection,
} from "./createGraphWithConnectionsFromBaseGraph"

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

  // Convert each connection to a chord (pair of perimeter T values)
  const chords: [number, number][] = connections.map((conn) => [
    perimeterT(conn.start, minX, maxX, minY, maxY),
    perimeterT(conn.end, minX, maxX, minY, maxY),
  ])

  let crossings = 0
  for (let i = 0; i < chords.length; i++) {
    for (let j = i + 1; j < chords.length; j++) {
      if (chordsCross(chords[i], chords[j])) {
        crossings++
      }
    }
  }
  return crossings
}

/**
 * Generates a random point on the perimeter of the given bounds
 */
const getRandomPerimeterPoint = (
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  random: () => number,
): { x: number; y: number } => {
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
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
}: CreateProblemFromBaseGraphParams): JumperGraphWithConnections => {
  const random = createSeededRandom(randomSeed)
  const graphBounds = calculateGraphBounds(baseGraph.regions)

  // Start with minimum connections needed for the desired crossings
  // For n connections, max crossings is n*(n-1)/2, so we need at least
  // ceil((1 + sqrt(1 + 8*numCrossings)) / 2) connections
  const minConnections = Math.ceil((1 + Math.sqrt(1 + 8 * numCrossings)) / 2)
  let numConnections = Math.max(2, minConnections)

  const maxAttempts = 10000
  let attempts = 0

  while (attempts < maxAttempts) {
    const xyConnections: XYConnection[] = []

    for (let i = 0; i < numConnections; i++) {
      const start = getRandomPerimeterPoint(graphBounds, random)
      const end = getRandomPerimeterPoint(graphBounds, random)

      xyConnections.push({
        start,
        end,
        connectionId: getConnectionId(i),
      })
    }

    const actualCrossings = countCrossings(xyConnections, graphBounds)

    if (actualCrossings === numCrossings) {
      return createGraphWithConnectionsFromBaseGraph(baseGraph, xyConnections)
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
