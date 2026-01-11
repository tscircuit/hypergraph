import { generateJumperX4Grid } from "../lib/JumperGraphSolver/jumper-graph-generator/generateJumperX4Grid"
import { createProblemFromBaseGraph } from "../lib/JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"
import { JumperGraphSolver } from "../lib/JumperGraphSolver/JumperGraphSolver"
import { calculateGraphBounds } from "../lib/JumperGraphSolver/jumper-graph-generator/calculateGraphBounds"

const SAMPLES_PER_CROSSING_COUNT = 100
const MIN_CROSSINGS = 2
const MAX_CROSSINGS = 30

const median = (numbers: number[]): number | undefined => {
  if (numbers.length === 0) return undefined
  const sorted = numbers.slice().sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted[middle]
}

const percentile = (numbers: number[], p: number): number | undefined => {
  if (numbers.length === 0) return undefined
  const sorted = numbers.slice().sort((a, b) => a - b)
  const index = Math.floor((p / 100) * (sorted.length - 1))
  return sorted[index]
}

const createBaseGraph = (orientation: "vertical" | "horizontal" = "vertical") =>
  generateJumperX4Grid({
    cols: 2,
    rows: 2,
    marginX: 1.2,
    marginY: 1.2,
    outerPaddingX: 2,
    outerPaddingY: 2,
    innerColChannelPointCount: 3,
    innerRowChannelPointCount: 3,
    outerChannelXPointCount: 5,
    outerChannelYPointCount: 5,
    regionsBetweenPads: true,
    orientation,
  })

// Calculate and display graph sizes for both orientations
const verticalGraph = createBaseGraph("vertical")
const verticalBounds = calculateGraphBounds(verticalGraph.regions)
const vWidth = verticalBounds.maxX - verticalBounds.minX
const vHeight = verticalBounds.maxY - verticalBounds.minY
console.log(
  `Graph size (vertical): ${vWidth.toFixed(1)}x${vHeight.toFixed(1)}mm`,
)

const horizontalGraph = createBaseGraph("horizontal")
const horizontalBounds = calculateGraphBounds(horizontalGraph.regions)
const hWidth = horizontalBounds.maxX - horizontalBounds.minX
const hHeight = horizontalBounds.maxY - horizontalBounds.minY
console.log(
  `Graph size (horizontal): ${hWidth.toFixed(1)}x${hHeight.toFixed(1)}mm`,
)

console.log("Benchmark: 2x2 1206x4 Jumper Grid Solver (Both Orientations)")
console.log("=".repeat(50))
console.log(
  `Testing ${MIN_CROSSINGS}-${MAX_CROSSINGS} connections with ${SAMPLES_PER_CROSSING_COUNT} samples each\n`,
)

const results: {
  numConnections: number
  successRate: number
  successes: number
}[] = []

for (
  let numCrossings = MIN_CROSSINGS;
  numCrossings <= MAX_CROSSINGS;
  numCrossings++
) {
  let successes = 0

  const iterationsTaken: number[] = []
  const solverDurations: number[] = []
  for (
    let sampleIndex = 0;
    sampleIndex < SAMPLES_PER_CROSSING_COUNT;
    sampleIndex++
  ) {
    const randomSeed = 1000 * numCrossings + sampleIndex
    let cumulativeDuration = 0

    for (const orientation of ["vertical", "horizontal"] as const) {
      const graphWithConnections = createProblemFromBaseGraph({
        baseGraph: createBaseGraph(orientation),
        numCrossings: numCrossings,
        randomSeed,
      })

      const solver = new JumperGraphSolver({
        inputGraph: {
          regions: graphWithConnections.regions,
          ports: graphWithConnections.ports,
        },
        inputConnections: graphWithConnections.connections,
      })

      const startTime = performance.now()
      solver.solve()
      const duration = performance.now() - startTime
      cumulativeDuration += duration

      if (solver.solved) {
        iterationsTaken.push(solver.iterations)
        solverDurations.push(cumulativeDuration)
        successes++
        break
      }
    }
  }

  const successRate = (successes / SAMPLES_PER_CROSSING_COUNT) * 100
  results.push({ numConnections: numCrossings, successRate, successes })

  const med = median(iterationsTaken)
  const p95 = percentile(iterationsTaken, 95)
  const p99 = percentile(iterationsTaken, 99)
  const medDuration = median(solverDurations)
  console.log(
    `Crossings: ${numCrossings.toString().padStart(2)} | ` +
      `Success: ${successes.toString().padStart(3)}/${SAMPLES_PER_CROSSING_COUNT} | ` +
      `Rate: ${successRate.toFixed(1).padStart(5)}%`,
    `  Med iters: ${med?.toFixed(0) ?? "N/A"}`,
    `  P95: ${p95?.toFixed(0) ?? "N/A"}, P99: ${p99?.toFixed(0) ?? "N/A"}`,
    `  Med time: ${medDuration !== undefined ? medDuration.toFixed(1) + "ms" : "N/A"}`,
  )
}

console.log("\n" + "=".repeat(50))
console.log("Summary:")
console.log("=".repeat(50))

const avgSuccessRate =
  results.reduce((sum, r) => sum + r.successRate, 0) / results.length
console.log(`Average success rate: ${avgSuccessRate.toFixed(1)}%`)

const perfectScores = results.filter((r) => r.successRate === 100).length
console.log(`Crossing counts with 100% success: ${perfectScores}`)

const zeroScores = results.filter((r) => r.successRate === 0).length
console.log(`Crossing counts with 0% success: ${zeroScores}`)
