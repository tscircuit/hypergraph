import { assertJumperGraphFitsProblemBounds } from "./assertJumperGraphFitsProblemBounds"
import { extractProblemBoundsFromDatasetSample } from "./extractProblemBoundsFromDatasetSample"
import { extractXYConnectionsFromDatasetSample } from "./extractXYConnectionsFromDatasetSample"
import type {
  Bounds,
  JumperSolverDatasetSample,
  JumperTopologyCandidate,
  SampleBenchmarkResult,
} from "./jumperSolverBenchmarkTypes"
import { runSingleJumperTopologyCandidateSolveAttempt } from "./runSingleJumperTopologyCandidateSolveAttempt"

type RunSingleJumperSolverDatasetSampleAgainstTopologyCandidatesOptions = {
  sample: JumperSolverDatasetSample
  sampleIndex: number
  totalSamples: number
  generateGraphsForBounds: (bounds: Bounds) => JumperTopologyCandidate[]
  logProgress?: (message: string) => void
}

type SingleSampleAgainstTopologiesResult = {
  sampleResult: SampleBenchmarkResult
  successfulGraphName: string | null
}

export const runSingleJumperSolverDatasetSampleAgainstTopologyCandidates = ({
  sample,
  sampleIndex,
  totalSamples,
  generateGraphsForBounds,
  logProgress,
}: RunSingleJumperSolverDatasetSampleAgainstTopologyCandidatesOptions): SingleSampleAgainstTopologiesResult => {
  const sampleLabel = `sample ${sampleIndex + 1}/${totalSamples}`
  logProgress?.(`[${sampleLabel}] Generating topology candidates...`)

  const problemBounds = extractProblemBoundsFromDatasetSample(sample)
  const candidateGraphs = generateGraphsForBounds(problemBounds)
  const xyConnections = extractXYConnectionsFromDatasetSample(sample)

  logProgress?.(
    `[${sampleLabel}] Trying ${candidateGraphs.length} topology candidates`,
  )

  let solved = false
  let successfulGraphName: string | null = null
  let iterations: number | null = null
  let durationMs: number | null = null
  let sampleError: string | undefined

  for (const [candidateIndex, candidate] of candidateGraphs.entries()) {
    logProgress?.(
      `[${sampleLabel}] Solving candidate graph ${candidateIndex + 1}/${candidateGraphs.length} ${candidate.name}...`,
    )

    assertJumperGraphFitsProblemBounds(
      candidate.name,
      candidate.graph,
      problemBounds,
    )

    const attemptResult = runSingleJumperTopologyCandidateSolveAttempt({
      candidate,
      xyConnections,
    })

    if (attemptResult.error) {
      sampleError = attemptResult.error
    }

    if (!attemptResult.solved) {
      continue
    }

    solved = true
    successfulGraphName = candidate.name
    iterations = attemptResult.iterations
    durationMs = attemptResult.durationMs
    break
  }

  return {
    sampleResult: {
      sampleIndex,
      solved,
      successfulGraphName,
      iterations,
      durationMs,
      error: solved ? undefined : sampleError,
    },
    successfulGraphName,
  }
}
