import {
  generate0603FilledAndStaggeredTopologyCandidates,
  runBenchmarkAgainstTopologies,
} from "../../script-lib/benchmarking"

const args = process.argv.slice(2)
const limitArg = args.find((arg) => arg.startsWith("--limit="))
const sampleLimit = limitArg
  ? Number.parseInt(limitArg.split("=")[1], 10)
  : undefined
const showHelp = args.includes("--help") || args.includes("-h")

if (showHelp) {
  console.log(`
Usage: bun run scripts/benchmarking-0603/run-benchmark-topologies-dataset02.ts [options]

Options:
  --limit=N    Only run first N samples
  --help, -h   Show this help message

Examples:
  bun run scripts/benchmarking-0603/run-benchmark-topologies-dataset02.ts --limit=20
  bun run scripts/benchmarking-0603/run-benchmark-topologies-dataset02.ts --limit=50
`)
  process.exit(0)
}

const benchmarkStart = Date.now()

console.log("Benchmark: dataset02 against generated topology variations")
console.log("=".repeat(70))
if (sampleLimit) {
  console.log(`Sample limit: ${sampleLimit}`)
}
console.log(
  "Topologies: filled rows/cols (grid) + staggered (x/y), both orientations",
)
console.log()

const summary = runBenchmarkAgainstTopologies({
  datasetName: "dataset02",
  generateGraphsForBounds: generate0603FilledAndStaggeredTopologyCandidates,
  limit: sampleLimit,
  logProgress: (message) => console.log(message),
})

const elapsedSeconds = ((Date.now() - benchmarkStart) / 1000).toFixed(1)
console.log(`Completed in ${elapsedSeconds}s`)
console.log("=".repeat(70))
console.log(`Total samples: ${summary.totalSamples}`)
console.log(`Solved samples: ${summary.solvedSamples}`)
console.log(`Unsolved samples: ${summary.unsolvedSamples}`)
console.log(`Success rate: ${summary.successRate.toFixed(1)}%`)

console.log("\nSuccessful graph counts:")
const sortedSuccessfulGraphCounts = Array.from(
  summary.successfulGraphCounts.entries(),
).sort((a, b) => b[1] - a[1])

if (sortedSuccessfulGraphCounts.length === 0) {
  console.log("  (none)")
} else {
  for (const [graphName, count] of sortedSuccessfulGraphCounts) {
    console.log(`  ${graphName}: ${count}`)
  }
}
