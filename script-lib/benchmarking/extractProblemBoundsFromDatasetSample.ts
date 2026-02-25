import type {
  Bounds,
  JumperSolverDatasetSample,
} from "./jumperSolverBenchmarkTypes"

export const extractProblemBoundsFromDatasetSample = (
  sample: JumperSolverDatasetSample,
): Bounds => {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const region of sample.connectionRegions) {
    const bounds = region.d.bounds
    minX = Math.min(minX, bounds.minX)
    maxX = Math.max(maxX, bounds.maxX)
    minY = Math.min(minY, bounds.minY)
    maxY = Math.max(maxY, bounds.maxY)
  }

  return { minX, maxX, minY, maxY }
}
