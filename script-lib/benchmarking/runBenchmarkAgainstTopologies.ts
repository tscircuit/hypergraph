import type {
  BenchmarkSummary,
  RunBenchmarkAgainstTopologiesOptions,
  SampleBenchmarkResult,
} from "./jumperSolverBenchmarkTypes"
import { loadJumperSolverDataset } from "./loadJumperSolverDataset"
import { runSingleJumperSolverDatasetSampleAgainstTopologyCandidates } from "./runSingleJumperSolverDatasetSampleAgainstTopologyCandidates"

export const runBenchmarkAgainstTopologies = ({
  generateGraphsForBounds,
  datasetName,
  limit,
  quickMode,
  logProgress,
}: RunBenchmarkAgainstTopologiesOptions): BenchmarkSummary => {
  const dataset = loadJumperSolverDataset(datasetName)
  const samples = limit ? dataset.slice(0, limit) : dataset
  const totalSamples = samples.length

  const successfulGraphCounts = new Map<string, number>()
  const results: SampleBenchmarkResult[] = []

  for (const [sampleIndex, sample] of samples.entries()) {
    const { sampleResult, successfulGraphName } =
      runSingleJumperSolverDatasetSampleAgainstTopologyCandidates({
        sample,
        sampleIndex,
        totalSamples,
        generateGraphsForBounds,
        quickMode,
        logProgress,
      })

    if (successfulGraphName) {
      successfulGraphCounts.set(
        successfulGraphName,
        (successfulGraphCounts.get(successfulGraphName) ?? 0) + 1,
      )
    }

    results.push(sampleResult)

    const sampleLabel = `sample ${sampleIndex + 1}/${totalSamples}`
    if (sampleResult.solved) {
      logProgress?.(
        `[${sampleLabel}] Completed: solved with ${sampleResult.successfulGraphName} in ${sampleResult.durationMs?.toFixed(1) ?? "N/A"}ms`,
      )
    } else {
      logProgress?.(
        `[${sampleLabel}] Completed: unsolved${sampleResult.error ? ` (${sampleResult.error})` : ""}`,
      )
    }
  }

  const solvedSamples = results.filter((result) => result.solved).length
  const unsolvedSamples = results.length - solvedSamples

  return {
    datasetName,
    totalSamples: results.length,
    solvedSamples,
    unsolvedSamples,
    successRate: (solvedSamples / results.length) * 100,
    successfulGraphCounts,
    results,
  }
}
