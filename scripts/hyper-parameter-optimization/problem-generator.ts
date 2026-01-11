import { generateJumperX4Grid } from "../../lib/JumperGraphSolver/jumper-graph-generator/generateJumperX4Grid"
import { createProblemFromBaseGraph } from "../../lib/JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"
import type { JumperGraphWithConnections } from "../../lib/JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import type { SampleConfig } from "./types"

// Track used seeds globally to never repeat
const usedSeeds = new Set<number>()
let seedCounter = 0

export function getUniqueSeed(): number {
  while (usedSeeds.has(seedCounter)) {
    seedCounter++
  }
  usedSeeds.add(seedCounter)
  return seedCounter++
}

export function getUsedSeedsCount(): number {
  return usedSeeds.size
}

export function createBaseGraph(
  orientation: "vertical" | "horizontal" = "vertical",
  rows: 1 | 2 | 3 = 1,
  cols: 1 | 2 | 3 = 1,
) {
  return generateJumperX4Grid({
    cols,
    rows,
    marginX: 1.2,
    marginY: 1.2,
    outerPaddingX: 2,
    outerPaddingY: 2,
    innerColChannelPointCount: 3,
    innerRowChannelPointCount: 3,
    outerChannelXPointCount: 3,
    outerChannelYPointCount: 3,
    regionsBetweenPads: true,
    orientation,
  })
}

export function generateSampleConfigs(
  count: number,
  minCrossings: number,
  maxCrossings: number,
): SampleConfig[] {
  const configs: SampleConfig[] = []
  const allGridSizes: [1 | 2 | 3, 1 | 2 | 3][] = [
    [1, 1],
    [1, 2],
    [2, 1],
    [2, 2],
    [1, 3],
    [2, 3],
    [3, 1],
    [3, 2],
    [3, 3],
  ]
  // Grid sizes for >8 crossings (must have at least 2 rows or 2 cols)
  const largeGridSizes: [1 | 2 | 3, 1 | 2 | 3][] = [
    [1, 2],
    [2, 1],
    [2, 2],
    [1, 3],
    [2, 3],
    [3, 1],
    [3, 2],
    [3, 3],
  ]
  for (let i = 0; i < count; i++) {
    const numCrossings = minCrossings + (i % (maxCrossings - minCrossings + 1))
    const gridSizes = numCrossings > 8 ? largeGridSizes : allGridSizes
    const [rows, cols] = gridSizes[i % gridSizes.length]
    configs.push({ numCrossings, seed: getUniqueSeed(), rows, cols })
  }
  return configs
}

export interface PregeneratedProblem {
  config: SampleConfig
  orientation: "vertical" | "horizontal"
  problem: JumperGraphWithConnections
}

/**
 * Pregenerates all problems for a set of sample configs.
 * Creates both vertical and horizontal orientations for each config.
 */
export function pregenerateProblems(
  configs: SampleConfig[],
  progressLabel?: string,
): PregeneratedProblem[] {
  const problems: PregeneratedProblem[] = []

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i]
    if (progressLabel) {
      process.stdout.write(
        `\r${progressLabel}: ${i + 1}/${configs.length} (generating both orientations)`,
      )
    }

    for (const orientation of ["vertical", "horizontal"] as const) {
      const problem = createProblemFromBaseGraph({
        baseGraph: createBaseGraph(orientation, config.rows, config.cols),
        numCrossings: config.numCrossings,
        randomSeed: config.seed,
      })
      problems.push({ config, orientation, problem })
    }
  }

  if (progressLabel) {
    process.stdout.write("\r" + " ".repeat(80) + "\r")
  }

  return problems
}

/**
 * Groups pregenerated problems by their config seed for easy lookup.
 */
export function groupProblemsByConfig(
  problems: PregeneratedProblem[],
): Map<number, PregeneratedProblem[]> {
  const grouped = new Map<number, PregeneratedProblem[]>()
  for (const p of problems) {
    const key = p.config.seed
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(p)
  }
  return grouped
}
