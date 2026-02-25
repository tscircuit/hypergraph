import type { JumperGraph } from "../../lib/JumperGraphSolver/jumper-types"

export type Bounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type JumperSolverDatasetName = "dataset02"

export type JumperSolverDatasetSample = {
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
      bounds: Bounds
      center: { x: number; y: number }
      isPad: boolean
      isConnectionRegion: boolean
    }
  }[]
}

export type JumperTopologyCandidate = {
  name: string
  graph: JumperGraph
}

export type RunBenchmarkAgainstTopologiesOptions = {
  generateGraphsForBounds: (bounds: Bounds) => JumperTopologyCandidate[]
  datasetName: JumperSolverDatasetName
  limit?: number
  logProgress?: (message: string) => void
}

export type SampleBenchmarkResult = {
  sampleIndex: number
  solved: boolean
  successfulGraphName: string | null
  iterations: number | null
  durationMs: number | null
  error?: string
}

export type BenchmarkSummary = {
  datasetName: JumperSolverDatasetName
  totalSamples: number
  solvedSamples: number
  unsolvedSamples: number
  successRate: number
  successfulGraphCounts: Map<string, number>
  results: SampleBenchmarkResult[]
}
