/**
 * Parallel benchmark for ViaGraphSolver using Node.js worker_threads.
 *
 * Usage: npx tsx scripts/benchmark-via-graph-dataset02-parallel-node.ts [options]
 *
 * This script uses a single file approach where worker code is embedded as a string
 * and executed via eval in the worker thread.
 */
import * as fs from "fs"
import { cpus } from "os"
import * as path from "path"
import { fileURLToPath } from "url"
import { Worker } from "worker_threads"
import type { ViaTile } from "../lib/ViaGraphSolver/ViaGraphSolver"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Parse command line arguments
const args = process.argv.slice(2)
const limitArg = args.find((a) => a.startsWith("--limit="))
const concurrencyArg = args.find((a) => a.startsWith("--concurrency="))
const SAMPLE_LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined
const CONCURRENCY = concurrencyArg
  ? parseInt(concurrencyArg.split("=")[1], 10)
  : cpus().length
const QUICK_MODE = args.includes("--quick")
const HELP = args.includes("--help") || args.includes("-h")

if (HELP) {
  console.log(`
Usage: npx tsx scripts/benchmark-via-graph-dataset02-parallel-node.ts [options]

Options:
  --limit=N         Only run first N samples (default: all 1000)
  --concurrency=N   Number of parallel workers (default: CPU count = ${cpus().length})
  --quick           Use reduced MAX_ITERATIONS for faster but less accurate results
  --help, -h        Show this help message

Examples:
  npx tsx scripts/benchmark-via-graph-dataset02-parallel-node.ts --limit=100
  npx tsx scripts/benchmark-via-graph-dataset02-parallel-node.ts --concurrency=4 --quick
  npx tsx scripts/benchmark-via-graph-dataset02-parallel-node.ts --limit=200 --concurrency=8
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

// Worker code as a string that uses the built dist/index.js
const workerCode = `
const { parentPort, workerData } = require('worker_threads');
const { ViaGraphSolver, createViaGraphFromXYConnections } = require(workerData.distPath);

const { sample, sampleIndex, viaTile, quickMode } = workerData;

function extractXYConnections(sample) {
  const regionMap = new Map(
    sample.connectionRegions.map((r) => [r.regionId, r.d.center])
  );

  return sample.connections.map((conn) => {
    const start = regionMap.get(conn.startRegionId);
    const end = regionMap.get(conn.endRegionId);

    if (!start || !end) {
      throw new Error(
        'Missing region for connection ' + conn.connectionId
      );
    }

    return {
      connectionId: conn.connectionId,
      start,
      end,
    };
  });
}

function solveSample() {
  try {
    const xyConnections = extractXYConnections(sample);
    const result = createViaGraphFromXYConnections(xyConnections, viaTile);

    const solverOpts = {
      inputGraph: {
        regions: result.regions,
        ports: result.ports,
      },
      inputConnections: result.connections,
      viaTile: result.viaTile,
    };

    if (quickMode) {
      solverOpts.baseMaxIterations = 50000;
    }

    const solver = new ViaGraphSolver(solverOpts);

    const startTime = performance.now();
    solver.solve();
    const duration = performance.now() - startTime;

    return {
      sampleIndex,
      numCrossings: sample.config.numCrossings,
      seed: sample.config.seed,
      rows: sample.config.rows,
      cols: sample.config.cols,
      orientation: sample.config.orientation,
      solved: solver.solved,
      failed: solver.failed,
      iterations: solver.iterations,
      duration,
      tileRows: result.tileCount.rows,
      tileCols: result.tileCount.cols,
    };
  } catch (e) {
    return {
      sampleIndex,
      numCrossings: sample.config.numCrossings,
      seed: sample.config.seed,
      rows: sample.config.rows,
      cols: sample.config.cols,
      orientation: sample.config.orientation,
      solved: false,
      failed: true,
      iterations: 0,
      duration: 0,
      tileRows: 0,
      tileCols: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

const result = solveSample();
parentPort.postMessage(result);
`

/**
 * Run a single sample in a worker thread
 */
function runSampleInWorker(
  sampleIndex: number,
  sample: DatasetSample,
  viaTile: ViaTile,
  quickMode: boolean,
  distPath: string,
): Promise<BenchmarkResult> {
  return new Promise((resolve) => {
    const worker = new Worker(workerCode, {
      eval: true,
      workerData: {
        sample,
        sampleIndex,
        viaTile,
        quickMode,
        distPath,
      },
    })

    worker.on("message", (result: BenchmarkResult) => {
      resolve(result)
    })

    worker.on("error", (err: Error) => {
      resolve({
        sampleIndex,
        numCrossings: sample.config.numCrossings,
        seed: sample.config.seed,
        rows: sample.config.rows,
        cols: sample.config.cols,
        orientation: sample.config.orientation,
        solved: false,
        failed: true,
        iterations: 0,
        duration: 0,
        tileRows: 0,
        tileCols: 0,
        error: err.message,
      })
    })

    worker.on("exit", (code) => {
      if (code !== 0) {
        resolve({
          sampleIndex,
          numCrossings: sample.config.numCrossings,
          seed: sample.config.seed,
          rows: sample.config.rows,
          cols: sample.config.cols,
          orientation: sample.config.orientation,
          solved: false,
          failed: true,
          iterations: 0,
          duration: 0,
          tileRows: 0,
          tileCols: 0,
          error: `Worker exited with code ${code}`,
        })
      }
    })
  })
}

/**
 * Process samples in parallel using worker threads with limited concurrency
 */
async function runParallelBenchmark(
  samples: DatasetSample[],
  viaTile: ViaTile,
  concurrency: number,
  quickMode: boolean,
  distPath: string,
  onProgress: (completed: number, results: BenchmarkResult[]) => void,
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = []
  let nextIndex = 0
  let completed = 0

  const processNext = async (): Promise<void> => {
    while (nextIndex < samples.length) {
      const currentIndex = nextIndex++
      const sample = samples[currentIndex]

      const result = await runSampleInWorker(
        currentIndex,
        sample,
        viaTile,
        quickMode,
        distPath,
      )

      results.push(result)
      completed++
      onProgress(completed, results)
    }
  }

  // Start workers up to concurrency limit
  const workers = Array(Math.min(concurrency, samples.length))
    .fill(null)
    .map(() => processNext())

  await Promise.all(workers)

  // Sort results by sample index
  return results.sort((a, b) => a.sampleIndex - b.sampleIndex)
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
const viaTilePath = path.join(
  __dirname,
  "../assets/ViaGraphSolver/via-tile.json",
)
const viaTile: ViaTile = JSON.parse(fs.readFileSync(viaTilePath, "utf8"))

// Path to built dist
const distPath = path.join(__dirname, "../dist/index.js")

// Check if dist exists
if (!fs.existsSync(distPath)) {
  console.error(
    "Error: dist/index.js not found. Please run 'npm run build' first.",
  )
  process.exit(1)
}

// Apply sample limit
const samplesToRun = SAMPLE_LIMIT ? dataset.slice(0, SAMPLE_LIMIT) : dataset
const totalSamples = samplesToRun.length

console.log("Benchmark: ViaGraphSolver with Dataset02 (Parallel - Node.js)")
console.log("=".repeat(70))
console.log(`Loaded ${dataset.length} samples from dataset02`)
console.log(`Via topology loaded from via-tile.json`)
console.log(`Concurrency: ${CONCURRENCY} workers`)
if (SAMPLE_LIMIT) {
  console.log(`Sample limit: ${SAMPLE_LIMIT}`)
}
if (QUICK_MODE) {
  console.log(`Quick mode: enabled (reduced MAX_ITERATIONS)`)
}
console.log()

const startTime = Date.now()
let lastProgressTime = Date.now()

const printProgress = (completed: number, results: BenchmarkResult[]) => {
  const now = Date.now()
  if (now - lastProgressTime >= 1000 || completed === totalSamples) {
    const solvedCount = results.filter((r) => r.solved).length
    const failedCount = results.filter((r) => r.failed && !r.solved).length
    const elapsed = ((now - startTime) / 1000).toFixed(1)
    const rate =
      completed > 0 ? ((solvedCount / completed) * 100).toFixed(1) : "0.0"
    const samplesPerSec = (completed / ((now - startTime) / 1000)).toFixed(1)
    console.log(
      `[${elapsed}s] ${completed}/${totalSamples} (${samplesPerSec}/s) | ` +
        `Solved: ${solvedCount} | Failed: ${failedCount} | Rate: ${rate}%`,
    )
    lastProgressTime = now
  }
}

// Run the benchmark
runParallelBenchmark(
  samplesToRun,
  viaTile,
  CONCURRENCY,
  QUICK_MODE,
  distPath,
  printProgress,
).then((results) => {
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
    {
      solved: number
      total: number
      iterations: number[]
      durations: number[]
    }
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
})
