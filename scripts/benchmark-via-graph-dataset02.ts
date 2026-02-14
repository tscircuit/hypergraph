import * as fs from "fs"
import * as path from "path"
import type { XYConnection } from "../lib/JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import { ViaGraphSolver } from "../lib/ViaGraphSolver/ViaGraphSolver"
import { createViaGraphFromXYConnections } from "../lib/ViaGraphSolver/via-graph-generator/createViaGraphFromXYConnections"

// Parse command line arguments
const args = process.argv.slice(2)
const limitArg = args.find((a) => a.startsWith("--limit="))
const SAMPLE_LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined
const QUICK_MODE = args.includes("--quick")
const HELP = args.includes("--help") || args.includes("-h")

if (HELP) {
  console.log(`
Usage: bun run scripts/benchmark-via-graph-dataset02.ts [options]

Options:
  --limit=N    Only run first N samples (default: all 1000)
  --quick      Use reduced MAX_ITERATIONS for faster but less accurate results
  --help, -h   Show this help message

Examples:
  bun run scripts/benchmark-via-graph-dataset02.ts --limit=50
  bun run scripts/benchmark-via-graph-dataset02.ts --quick --limit=100
`)
  process.exit(0)
}

// Types for dataset02 structure
type DatasetSample = {
  config: {
    numCrossings: number
    seed: number
    rows: number
    cols: number
    orientation: "vertical" | "horizontal"
  }
  connections: {
    connectionId: string
    startRegionId: string
    endRegionId: string
  }[]
  connectionRegions: {
    regionId: string
    pointIds: string[]
    d: {
      bounds: { minX: number; maxX: number; minY: number; maxY: number }
      center: { x: number; y: number }
      isPad: boolean
      isConnectionRegion: boolean
    }
  }[]
}

type ViasByNet = Record<
  string,
  { viaId: string; diameter: number; position: { x: number; y: number } }[]
>

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

const mean = (numbers: number[]): number | undefined => {
  if (numbers.length === 0) return undefined
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length
}

/**
 * Extracts XYConnections from a dataset sample by mapping connection IDs
 * to their corresponding region centers
 */
const extractXYConnections = (sample: DatasetSample): XYConnection[] => {
  const regionMap = new Map(
    sample.connectionRegions.map((r) => [r.regionId, r.d.center]),
  )

  return sample.connections.map((conn) => {
    const start = regionMap.get(conn.startRegionId)
    const end = regionMap.get(conn.endRegionId)

    if (!start || !end) {
      throw new Error(
        `Missing region for connection ${conn.connectionId}: start=${conn.startRegionId}, end=${conn.endRegionId}`,
      )
    }

    return {
      connectionId: conn.connectionId,
      start,
      end,
    }
  })
}

/**
 * Attempts to solve a problem using ViaGraphSolver
 */
const tryToSolve = (
  xyConnections: XYConnection[],
  viasByNet: ViasByNet,
  quickMode: boolean,
): {
  solved: boolean
  failed: boolean
  iterations: number
  duration: number
  tileRows: number
  tileCols: number
  error?: string
} => {
  try {
    const result = createViaGraphFromXYConnections(xyConnections, viasByNet)

    const solverOpts: ConstructorParameters<typeof ViaGraphSolver>[0] = {
      inputGraph: {
        regions: result.regions,
        ports: result.ports,
      },
      inputConnections: result.connections,
      viasByNet: result.tiledViasByNet,
    }

    // In quick mode, reduce max iterations for faster benchmarking
    if (quickMode) {
      solverOpts.baseMaxIterations = 50000
    }

    const solver = new ViaGraphSolver(solverOpts)

    const startTime = performance.now()
    solver.solve()
    const duration = performance.now() - startTime

    return {
      solved: solver.solved,
      failed: solver.failed,
      iterations: solver.iterations,
      duration,
      tileRows: result.tileCount.rows,
      tileCols: result.tileCount.cols,
    }
  } catch (e) {
    return {
      solved: false,
      failed: true,
      iterations: 0,
      duration: 0,
      tileRows: 0,
      tileCols: 0,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// Load dataset02
const datasetPath = path.join(
  __dirname,
  "../datasets/jumper-graph-solver/dataset02.json",
)
const dataset: DatasetSample[] = JSON.parse(
  fs.readFileSync(datasetPath, "utf8"),
)

// Load vias-by-net
const viasByNetPath = path.join(__dirname, "../vias-by-net.json")
const viasByNet: ViasByNet = JSON.parse(fs.readFileSync(viasByNetPath, "utf8"))

console.log("Benchmark: ViaGraphSolver with Dataset02")
console.log("=".repeat(70))
console.log(`Loaded ${dataset.length} samples from dataset02`)
console.log(`Via topology loaded from vias-by-net.json`)
if (SAMPLE_LIMIT) {
  console.log(`Sample limit: ${SAMPLE_LIMIT}`)
}
if (QUICK_MODE) {
  console.log(`Quick mode: enabled (reduced MAX_ITERATIONS)`)
}
console.log()

type BenchmarkResult = {
  sampleIndex: number
  numCrossings: number
  seed: number
  rows: number
  cols: number
  orientation: "vertical" | "horizontal"
  solved: boolean
  failed: boolean
  iterations: number
  duration: number
  tileRows: number
  tileCols: number
  error?: string
}

const results: BenchmarkResult[] = []

// Progress tracking
let lastProgressTime = Date.now()
const startTime = Date.now()

const printProgress = (sampleIndex: number, total: number) => {
  const solvedSoFar = results.filter((r) => r.solved).length
  const failedSoFar = results.filter((r) => r.failed && !r.solved).length
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(
    `[${elapsed}s] Sample ${sampleIndex + 1}/${total} | ` +
      `Solved: ${solvedSoFar} | Failed: ${failedSoFar} | ` +
      `Rate: ${((solvedSoFar / results.length) * 100).toFixed(1)}%`,
  )
}

// Apply sample limit
const samplesToRun = SAMPLE_LIMIT ? dataset.slice(0, SAMPLE_LIMIT) : dataset
const totalSamples = samplesToRun.length

for (let i = 0; i < totalSamples; i++) {
  const sample = samplesToRun[i]
  const xyConnections = extractXYConnections(sample)

  // Print progress every 1 second
  const now = Date.now()
  if (now - lastProgressTime >= 1000) {
    printProgress(i, totalSamples)
    lastProgressTime = now
  }

  const result = tryToSolve(xyConnections, viasByNet, QUICK_MODE)

  results.push({
    sampleIndex: i,
    numCrossings: sample.config.numCrossings,
    seed: sample.config.seed,
    rows: sample.config.rows,
    cols: sample.config.cols,
    orientation: sample.config.orientation,
    solved: result.solved,
    failed: result.failed,
    iterations: result.iterations,
    duration: result.duration,
    tileRows: result.tileRows,
    tileCols: result.tileCols,
    error: result.error,
  })
}

// Final progress
const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1)
console.log(`\nCompleted in ${totalElapsed}s\n`)

// Calculate statistics
const solvedResults = results.filter((r) => r.solved)
const failedResults = results.filter((r) => r.failed && !r.solved)
const unsolved = results.filter((r) => !r.solved)

const successRate = (solvedResults.length / results.length) * 100

console.log("=".repeat(70))
console.log("Overall Results")
console.log("=".repeat(70))
console.log(`Total samples:  ${results.length}`)
console.log(
  `Solved:         ${solvedResults.length} (${successRate.toFixed(1)}%)`,
)
console.log(
  `Failed:         ${failedResults.length} (${((failedResults.length / results.length) * 100).toFixed(1)}%)`,
)
console.log(
  `Unsolved:       ${unsolved.length} (${((unsolved.length / results.length) * 100).toFixed(1)}%)`,
)

// Iteration statistics for solved samples
const solvedIterations = solvedResults.map((r) => r.iterations)
const solvedDurations = solvedResults.map((r) => r.duration)

console.log("\n" + "=".repeat(70))
console.log("Performance Statistics (Solved Samples)")
console.log("=".repeat(70))
console.log(
  `Iterations - Mean: ${mean(solvedIterations)?.toFixed(0) ?? "N/A"}, ` +
    `Median: ${median(solvedIterations)?.toFixed(0) ?? "N/A"}, ` +
    `P90: ${percentile(solvedIterations, 90)?.toFixed(0) ?? "N/A"}, ` +
    `P99: ${percentile(solvedIterations, 99)?.toFixed(0) ?? "N/A"}`,
)
console.log(
  `Duration (ms) - Mean: ${mean(solvedDurations)?.toFixed(1) ?? "N/A"}, ` +
    `Median: ${median(solvedDurations)?.toFixed(1) ?? "N/A"}, ` +
    `P90: ${percentile(solvedDurations, 90)?.toFixed(1) ?? "N/A"}, ` +
    `P99: ${percentile(solvedDurations, 99)?.toFixed(1) ?? "N/A"}`,
)

// Tile distribution
const tileCounts = solvedResults.map((r) => `${r.tileCols}x${r.tileRows}`)
const tileCountMap = new Map<string, number>()
for (const t of tileCounts) {
  tileCountMap.set(t, (tileCountMap.get(t) || 0) + 1)
}
console.log("\nTile grid distribution (solved):")
const sortedTiles = Array.from(tileCountMap.entries()).sort((a, b) => {
  const [aCols, aRows] = a[0].split("x").map(Number)
  const [bCols, bRows] = b[0].split("x").map(Number)
  return aCols * aRows - bCols * bRows
})
for (const [tile, count] of sortedTiles) {
  const pct = ((count / solvedResults.length) * 100).toFixed(1)
  console.log(`  ${tile}: ${count} (${pct}%)`)
}

// Success rate by crossing count
console.log("\n" + "=".repeat(70))
console.log("Success Rate by Crossing Count")
console.log("=".repeat(70))
const crossingGroups = new Map<
  number,
  { solved: number; total: number; iterations: number[]; durations: number[] }
>()
for (const r of results) {
  const crossings = r.numCrossings
  if (!crossingGroups.has(crossings)) {
    crossingGroups.set(crossings, {
      solved: 0,
      total: 0,
      iterations: [],
      durations: [],
    })
  }
  const group = crossingGroups.get(crossings)!
  group.total++
  if (r.solved) {
    group.solved++
    group.iterations.push(r.iterations)
    group.durations.push(r.duration)
  }
}
const sortedCrossings = Array.from(crossingGroups.entries()).sort(
  (a, b) => a[0] - b[0],
)
for (const [crossings, { solved, total, iterations }] of sortedCrossings) {
  const pct = ((solved / total) * 100).toFixed(0)
  const medIters = median(iterations)?.toFixed(0) ?? "N/A"
  console.log(
    `  ${crossings.toString().padStart(2)} crossings: ${solved.toString().padStart(3)}/${total.toString().padStart(3)} (${pct.padStart(3)}%) | Median iters: ${medIters}`,
  )
}

// Success rate by grid size (rows x cols from config)
console.log("\n" + "=".repeat(70))
console.log("Success Rate by Problem Grid Size (rows x cols)")
console.log("=".repeat(70))
const gridGroups = new Map<
  string,
  { solved: number; total: number; iterations: number[] }
>()
for (const r of results) {
  const grid = `${r.rows}x${r.cols}`
  if (!gridGroups.has(grid)) {
    gridGroups.set(grid, { solved: 0, total: 0, iterations: [] })
  }
  const group = gridGroups.get(grid)!
  group.total++
  if (r.solved) {
    group.solved++
    group.iterations.push(r.iterations)
  }
}
const sortedGrids = Array.from(gridGroups.entries()).sort((a, b) => {
  const [aRows, aCols] = a[0].split("x").map(Number)
  const [bRows, bCols] = b[0].split("x").map(Number)
  return aRows * aCols - bRows * bCols
})
for (const [grid, { solved, total, iterations }] of sortedGrids) {
  const pct = ((solved / total) * 100).toFixed(0)
  const medIters = median(iterations)?.toFixed(0) ?? "N/A"
  console.log(
    `  ${grid.padStart(4)}: ${solved.toString().padStart(3)}/${total.toString().padStart(3)} (${pct.padStart(3)}%) | Median iters: ${medIters}`,
  )
}

// Success rate by orientation
console.log("\n" + "=".repeat(70))
console.log("Success Rate by Orientation")
console.log("=".repeat(70))
const orientationGroups = new Map<
  string,
  { solved: number; total: number; iterations: number[] }
>()
for (const r of results) {
  const orient = r.orientation
  if (!orientationGroups.has(orient)) {
    orientationGroups.set(orient, { solved: 0, total: 0, iterations: [] })
  }
  const group = orientationGroups.get(orient)!
  group.total++
  if (r.solved) {
    group.solved++
    group.iterations.push(r.iterations)
  }
}
for (const [orient, { solved, total, iterations }] of orientationGroups) {
  const pct = ((solved / total) * 100).toFixed(0)
  const medIters = median(iterations)?.toFixed(0) ?? "N/A"
  console.log(
    `  ${orient.padEnd(10)}: ${solved.toString().padStart(3)}/${total.toString().padStart(3)} (${pct.padStart(3)}%) | Median iters: ${medIters}`,
  )
}

// Show some unsolved samples
if (unsolved.length > 0 && unsolved.length <= 30) {
  console.log("\n" + "=".repeat(70))
  console.log("Unsolved Samples")
  console.log("=".repeat(70))
  for (const r of unsolved) {
    console.log(
      `  Sample ${r.sampleIndex}: ${r.numCrossings} crossings, ${r.rows}x${r.cols} ${r.orientation}, seed=${r.seed}${r.error ? ` (error: ${r.error})` : ""}`,
    )
  }
} else if (unsolved.length > 30) {
  console.log(
    `\n${unsolved.length} samples could not be solved (showing first 30):`,
  )
  for (const r of unsolved.slice(0, 30)) {
    console.log(
      `  Sample ${r.sampleIndex}: ${r.numCrossings} crossings, ${r.rows}x${r.cols} ${r.orientation}, seed=${r.seed}`,
    )
  }
}

console.log("\n" + "=".repeat(70))
console.log("Benchmark Complete")
console.log("=".repeat(70))
