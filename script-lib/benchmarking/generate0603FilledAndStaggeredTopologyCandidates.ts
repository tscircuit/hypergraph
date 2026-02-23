import {
  generate0603JumperHyperGraph,
  generate0603Pattern,
  resolve0603GridOptions,
} from "@tscircuit/jumper-topology-generator"
import { calculateGraphBounds } from "../../lib/JumperGraphSolver/jumper-graph-generator/calculateGraphBounds"
import type { JumperGraph } from "../../lib/JumperGraphSolver/jumper-types"
import { getBoundsHeight } from "./getBoundsHeight"
import { getBoundsWidth } from "./getBoundsWidth"
import type {
  Bounds,
  JumperTopologyCandidate,
} from "./jumperSolverBenchmarkTypes"
import { translateJumperGraphByOffset } from "./translateJumperGraphByOffset"

type Generate0603FilledAndStaggeredTopologyCandidatesOptions = {
  maxRows?: number
  maxCols?: number
  maxCandidatesPerSample?: number
}

type CandidatePattern = "grid" | "staggered"
type CandidateOrientation = "vertical" | "horizontal"
type CandidateStaggerAxis = "x" | "y"

type CandidateDescriptor = {
  rows: number
  cols: number
  orientation: CandidateOrientation
  pattern: CandidatePattern
  staggerAxis?: CandidateStaggerAxis
  estimatedArea: number
  name: string
}

const candidateCacheByBoundsKey = new Map<string, JumperTopologyCandidate[]>()
const graphCacheByTopologyKey = new Map<string, JumperGraph>()

const getBoundsCacheKey = (
  width: number,
  height: number,
  options: Required<Generate0603FilledAndStaggeredTopologyCandidatesOptions>,
) => {
  return [
    width.toFixed(4),
    height.toFixed(4),
    options.maxRows,
    options.maxCols,
    options.maxCandidatesPerSample,
  ].join("|")
}

const getTopologyKey = (descriptor: CandidateDescriptor) => {
  return [
    descriptor.rows,
    descriptor.cols,
    descriptor.orientation,
    descriptor.pattern,
    descriptor.staggerAxis ?? "-",
  ].join("|")
}

const centerGraphWithinProblemBounds = (
  graph: JumperGraph,
  problemBounds: Bounds,
): JumperGraph => {
  const graphBounds = calculateGraphBounds(graph.regions)
  const graphCenterX = (graphBounds.minX + graphBounds.maxX) / 2
  const graphCenterY = (graphBounds.minY + graphBounds.maxY) / 2
  const problemCenterX = (problemBounds.minX + problemBounds.maxX) / 2
  const problemCenterY = (problemBounds.minY + problemBounds.maxY) / 2

  return translateJumperGraphByOffset(
    graph,
    problemCenterX - graphCenterX,
    problemCenterY - graphCenterY,
  )
}

const estimateCandidateBounds = (
  rows: number,
  cols: number,
  orientation: CandidateOrientation,
  pattern: CandidatePattern,
  staggerAxis?: CandidateStaggerAxis,
) => {
  const resolved = resolve0603GridOptions({
    rows,
    cols,
    orientation,
    pattern,
    ...(staggerAxis ? { staggerAxis } : {}),
  })

  const { bounds } = generate0603Pattern(resolved)
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY

  return { width, height }
}

const getMaxRowsAndColsToTry = (
  problemWidth: number,
  problemHeight: number,
  maxRows: number,
  maxCols: number,
) => {
  const compactVertical = resolve0603GridOptions({
    rows: 1,
    cols: 1,
    orientation: "vertical",
    pattern: "grid",
  })

  const minSingleCellWidth =
    compactVertical.padHeight + 2 * compactVertical.boundsPadding
  const minSingleCellHeight =
    compactVertical.padGap +
    2 * compactVertical.padWidth +
    2 * compactVertical.boundsPadding

  const maxColsFromBounds =
    Math.floor((problemWidth - minSingleCellWidth) / compactVertical.pitchX) + 1
  const maxRowsFromBounds =
    Math.floor((problemHeight - minSingleCellHeight) / compactVertical.pitchY) +
    1

  return {
    maxRowsToTry: Math.max(1, Math.min(maxRows, maxRowsFromBounds)),
    maxColsToTry: Math.max(1, Math.min(maxCols, maxColsFromBounds)),
  }
}

export const generate0603FilledAndStaggeredTopologyCandidates = (
  bounds: Bounds,
  {
    maxRows = 8,
    maxCols = 8,
    maxCandidatesPerSample = 18,
  }: Generate0603FilledAndStaggeredTopologyCandidatesOptions = {},
): JumperTopologyCandidate[] => {
  const resolvedOptions = {
    maxRows,
    maxCols,
    maxCandidatesPerSample,
  }

  const problemWidth = getBoundsWidth(bounds)
  const problemHeight = getBoundsHeight(bounds)
  const boundsCacheKey = getBoundsCacheKey(
    problemWidth,
    problemHeight,
    resolvedOptions,
  )

  const cachedCandidates = candidateCacheByBoundsKey.get(boundsCacheKey)
  if (cachedCandidates) {
    return cachedCandidates
  }

  const { maxRowsToTry, maxColsToTry } = getMaxRowsAndColsToTry(
    problemWidth,
    problemHeight,
    maxRows,
    maxCols,
  )

  const descriptors: CandidateDescriptor[] = []

  const orientations: CandidateOrientation[] = ["vertical", "horizontal"]

  for (let rows = 1; rows <= maxRowsToTry; rows++) {
    for (let cols = 1; cols <= maxColsToTry; cols++) {
      for (const orientation of orientations) {
        const gridEstimate = estimateCandidateBounds(
          rows,
          cols,
          orientation,
          "grid",
        )

        if (
          gridEstimate.width <= problemWidth &&
          gridEstimate.height <= problemHeight
        ) {
          descriptors.push({
            rows,
            cols,
            orientation,
            pattern: "grid",
            estimatedArea: gridEstimate.width * gridEstimate.height,
            name: `0603-filled-${rows}x${cols}-${orientation}`,
          })
        }

        for (const staggerAxis of ["x", "y"] as const) {
          const staggeredEstimate = estimateCandidateBounds(
            rows,
            cols,
            orientation,
            "staggered",
            staggerAxis,
          )

          if (
            staggeredEstimate.width <= problemWidth &&
            staggeredEstimate.height <= problemHeight
          ) {
            descriptors.push({
              rows,
              cols,
              orientation,
              pattern: "staggered",
              staggerAxis,
              estimatedArea: staggeredEstimate.width * staggeredEstimate.height,
              name: `0603-staggered-${staggerAxis}-${rows}x${cols}-${orientation}`,
            })
          }
        }
      }
    }
  }

  const selectedDescriptors = descriptors
    .toSorted((a, b) => b.estimatedArea - a.estimatedArea)
    .slice(0, maxCandidatesPerSample)

  const candidates = selectedDescriptors.map((descriptor) => {
    const topologyKey = getTopologyKey(descriptor)
    let graph = graphCacheByTopologyKey.get(topologyKey)

    if (!graph) {
      graph = generate0603JumperHyperGraph({
        rows: descriptor.rows,
        cols: descriptor.cols,
        orientation: descriptor.orientation,
        pattern: descriptor.pattern,
        ...(descriptor.staggerAxis
          ? { staggerAxis: descriptor.staggerAxis }
          : {}),
      }) as unknown as JumperGraph
      graphCacheByTopologyKey.set(topologyKey, graph)
    }

    return {
      name: descriptor.name,
      graph: centerGraphWithinProblemBounds(graph, bounds),
    }
  })

  candidateCacheByBoundsKey.set(boundsCacheKey, candidates)
  return candidates
}
