import {
  generate0603JumperHyperGraph,
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
  staggerOffset?: number
  estimatedArea: number
  name: string
}

const MIN_ADJACENT_JUMPER_PAD_SPACING = 0.25
const CANDIDATE_GENERATOR_VERSION = 2

const candidateCacheByBoundsKey = new Map<string, JumperTopologyCandidate[]>()
const graphCacheByTopologyKey = new Map<string, JumperGraph>()

const getBoundsCacheKey = (
  width: number,
  height: number,
  options: Required<Generate0603FilledAndStaggeredTopologyCandidatesOptions>,
) => {
  return [
    CANDIDATE_GENERATOR_VERSION,
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
    descriptor.staggerOffset?.toFixed(4) ?? "-",
  ].join("|")
}

const getHalfPitchStaggerOffset = (
  rows: number,
  cols: number,
  orientation: CandidateOrientation,
  staggerAxis: CandidateStaggerAxis,
) => {
  const gridResolved = resolve0603GridOptions({
    rows,
    cols,
    orientation,
    pattern: "grid",
    clearance: MIN_ADJACENT_JUMPER_PAD_SPACING,
  })

  return staggerAxis === "x" ? gridResolved.pitchX / 2 : gridResolved.pitchY / 2
}

const getMaxCountThatFits = (
  availableSize: number,
  baseSize: number,
  pitch: number,
): number => {
  if (availableSize + Number.EPSILON < baseSize) {
    return 0
  }

  return Math.floor((availableSize - baseSize) / pitch + Number.EPSILON) + 1
}

const getGridPatternBaseSize = (orientation: CandidateOrientation) => {
  const resolved = resolve0603GridOptions({
    rows: 1,
    cols: 1,
    orientation,
    pattern: "grid",
    clearance: MIN_ADJACENT_JUMPER_PAD_SPACING,
  })

  return {
    baseWidth:
      resolved.padGap + 2 * resolved.padWidth + 2 * resolved.boundsPadding,
    baseHeight:
      resolved.padGap +
      resolved.padWidth +
      resolved.padHeight +
      2 * resolved.boundsPadding,
    pitchX: resolved.pitchX,
    pitchY: resolved.pitchY,
  }
}

const getStaggeredPatternBaseSize = (orientation: CandidateOrientation) => {
  const resolved = resolve0603GridOptions({
    rows: 1,
    cols: 1,
    orientation,
    pattern: "staggered",
    clearance: MIN_ADJACENT_JUMPER_PAD_SPACING,
  })

  const bodyWidth =
    orientation === "horizontal"
      ? resolved.padGap + 2 * resolved.padWidth
      : resolved.padHeight
  const bodyHeight =
    orientation === "horizontal"
      ? resolved.padHeight
      : resolved.padGap + 2 * resolved.padWidth

  return {
    baseWidth: bodyWidth + 2 * resolved.boundsPadding,
    baseHeight: bodyHeight + 2 * resolved.boundsPadding,
    pitchX: resolved.pitchX,
    pitchY: resolved.pitchY,
  }
}

const getBestStaggeredCandidate = (
  orientation: CandidateOrientation,
  problemWidth: number,
  problemHeight: number,
  maxRows: number,
  maxCols: number,
): CandidateDescriptor | null => {
  const staggerAxis: CandidateStaggerAxis =
    orientation === "vertical" ? "y" : "x"
  const staggerBase = getStaggeredPatternBaseSize(orientation)
  const staggerOffset = getHalfPitchStaggerOffset(
    1,
    1,
    orientation,
    staggerAxis,
  )

  const maxRowsFromHeight = Math.min(
    maxRows,
    getMaxCountThatFits(
      problemHeight,
      staggerBase.baseHeight,
      staggerBase.pitchY,
    ),
  )
  const maxColsFromWidth = Math.min(
    maxCols,
    getMaxCountThatFits(
      problemWidth,
      staggerBase.baseWidth,
      staggerBase.pitchX,
    ),
  )

  if (maxRowsFromHeight <= 0 || maxColsFromWidth <= 0) {
    return null
  }

  let bestRows = 0
  let bestCols = 0
  let bestCellCount = 0

  const consider = (rows: number, cols: number) => {
    if (rows <= 0 || cols <= 0) {
      return
    }

    const cellCount = rows * cols
    if (
      cellCount > bestCellCount ||
      (cellCount === bestCellCount && rows + cols > bestRows + bestCols)
    ) {
      bestRows = rows
      bestCols = cols
      bestCellCount = cellCount
    }
  }

  if (staggerAxis === "x") {
    const colsForSingleRow = Math.min(
      maxCols,
      getMaxCountThatFits(
        problemWidth,
        staggerBase.baseWidth,
        staggerBase.pitchX,
      ),
    )
    consider(1, colsForSingleRow)

    if (maxRowsFromHeight > 1) {
      const colsForMultiRow = Math.min(
        maxCols,
        getMaxCountThatFits(
          problemWidth,
          staggerBase.baseWidth + staggerOffset,
          staggerBase.pitchX,
        ),
      )
      consider(maxRowsFromHeight, colsForMultiRow)
    }
  } else {
    const rowsForSingleCol = Math.min(
      maxRows,
      getMaxCountThatFits(
        problemHeight,
        staggerBase.baseHeight,
        staggerBase.pitchY,
      ),
    )
    consider(rowsForSingleCol, 1)

    if (maxColsFromWidth > 1) {
      const rowsForMultiCol = Math.min(
        maxRows,
        getMaxCountThatFits(
          problemHeight,
          staggerBase.baseHeight + staggerOffset,
          staggerBase.pitchY,
        ),
      )
      consider(rowsForMultiCol, maxColsFromWidth)
    }
  }

  if (bestCellCount <= 0) {
    return null
  }

  const extraWidth = staggerAxis === "x" && bestRows > 1 ? staggerOffset : 0
  const extraHeight = staggerAxis === "y" && bestCols > 1 ? staggerOffset : 0
  const width =
    staggerBase.baseWidth + (bestCols - 1) * staggerBase.pitchX + extraWidth
  const height =
    staggerBase.baseHeight + (bestRows - 1) * staggerBase.pitchY + extraHeight

  return {
    rows: bestRows,
    cols: bestCols,
    orientation,
    pattern: "staggered",
    staggerAxis,
    staggerOffset,
    estimatedArea: width * height,
    name: `0603-staggered-${staggerAxis}-${bestRows}x${bestCols}-${orientation}`,
  }
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
    return structuredClone(cachedCandidates)
  }

  const descriptors: CandidateDescriptor[] = []

  const orientations: CandidateOrientation[] = ["vertical", "horizontal"]

  for (const orientation of orientations) {
    const gridBase = getGridPatternBaseSize(orientation)
    const maxRowsForGrid = Math.min(
      maxRows,
      getMaxCountThatFits(problemHeight, gridBase.baseHeight, gridBase.pitchY),
    )
    const maxColsForGrid = Math.min(
      maxCols,
      getMaxCountThatFits(problemWidth, gridBase.baseWidth, gridBase.pitchX),
    )

    if (maxRowsForGrid > 0 && maxColsForGrid > 0) {
      const filledWidth =
        gridBase.baseWidth + (maxColsForGrid - 1) * gridBase.pitchX
      const filledHeight =
        gridBase.baseHeight + (maxRowsForGrid - 1) * gridBase.pitchY

      descriptors.push({
        rows: maxRowsForGrid,
        cols: maxColsForGrid,
        orientation,
        pattern: "grid",
        estimatedArea: filledWidth * filledHeight,
        name: `0603-filled-${maxRowsForGrid}x${maxColsForGrid}-${orientation}`,
      })
    }

    const bestStaggered = getBestStaggeredCandidate(
      orientation,
      problemWidth,
      problemHeight,
      maxRows,
      maxCols,
    )
    if (bestStaggered) {
      descriptors.push(bestStaggered)
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
        clearance: MIN_ADJACENT_JUMPER_PAD_SPACING,
        maxNeckRatio: 0.4,
        minSplitBalanceRatio: 0.2,
        ...(descriptor.staggerAxis
          ? { staggerAxis: descriptor.staggerAxis }
          : {}),
        ...(descriptor.staggerOffset !== undefined
          ? { staggerOffset: descriptor.staggerOffset }
          : {}),
      }) as unknown as JumperGraph
      graphCacheByTopologyKey.set(topologyKey, graph)
    }

    return {
      name: descriptor.name,
      graph: centerGraphWithinProblemBounds(graph, bounds),
    }
  })

  candidateCacheByBoundsKey.set(boundsCacheKey, structuredClone(candidates))
  return structuredClone(candidates)
}
