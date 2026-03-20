import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { GraphicsObject } from "graphics-debug"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { ArrayGeometricHyperGraphSolver } from "../lib/GeometricHyperGraphSolver/ArrayGeometricHyperGraphSolver"
import {
  computeCommittedGeometricIntersectionPenaltyCost,
  countCommittedGeometricRouteIntersections,
  getCommittedGeometricIntersectionMarkers,
} from "../lib/GeometricHyperGraphSolver/computeGeometricIntersectionPenaltyCost"
import type { GeometricHyperGraph } from "../lib/GeometricHyperGraphSolver/geometric-types"
import { prepareGeometricHyperGraphForSolver } from "../lib/GeometricHyperGraphSolver/prepareGeometricHyperGraphForSolver"
import {
  HyperGraphSectionOptimizer2,
  type CreateSectionSolverInput,
} from "../lib/HyperGraphSectionOptimizer/HyperGraphSectionOptimizer2"
import { visualizeJumperGraphWithSolvedRoutes } from "../lib/JumperGraphSolver/visualizeJumperGraphSolver"
import { convertSerializedHyperGraphToHyperGraph } from "../lib/convertSerializedHyperGraphToHyperGraph"
import { convertSerializedSolvedRoutesToSolvedRoutes } from "../lib/convertSerializedSolvedRoutesToSolvedRoutes"
import type {
  Connection,
  SerializedHyperGraph,
  SolvedRoute,
} from "../lib/types"
import { stackSvgsVertically } from "stack-svgs"

type ManifestEntry = {
  sampleName: string
  circuitKey: string
  circuitId: string
  stepsToPortPointSolve: number
}

type Manifest = {
  effort: number
  sampleCount: number
  samples: ManifestEntry[]
}

type BenchmarkConfig = {
  limit?: number
  sampleName?: string
  sectionExpansionHops: number
  maxTargetRegionAttempts: number
  maxSectionAttempts: number
  minCentralRegionCost: number
  effort: number
  intersectionPenalty: number
}

const DEFAULT_INTERSECTION_PENALTY = 1_000
let activeIntersectionPenalty = DEFAULT_INTERSECTION_PENALTY

class IntersectionPenaltySectionOptimizer extends HyperGraphSectionOptimizer2 {
  protected override createHyperGraphSolver(input: CreateSectionSolverInput) {
    const graph = prepareGeometricHyperGraphForSolver(
      convertSerializedHyperGraphToHyperGraph(input.inputGraph),
    )

    return new ArrayGeometricHyperGraphSolver({
      inputGraph: graph,
      inputConnections: input.inputConnections,
      inputSolvedRoutes: convertSerializedSolvedRoutesToSolvedRoutes(
        input.inputSolvedRoutes,
        graph,
      ),
      intersectionPenalty: activeIntersectionPenalty,
    }) as any
  }
}

const DEFAULT_CONFIG: BenchmarkConfig = {
  sectionExpansionHops: 2,
  maxTargetRegionAttempts: 3,
  maxSectionAttempts: 16,
  minCentralRegionCost: 0,
  effort: 1,
  intersectionPenalty: DEFAULT_INTERSECTION_PENALTY,
}

const parseArgs = (): BenchmarkConfig => {
  const config = { ...DEFAULT_CONFIG }
  const args = process.argv.slice(2)

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const nextArg = args[i + 1]
    if (!nextArg) continue

    if (arg === "--limit") {
      config.limit = Number.parseInt(nextArg, 10)
      i += 1
      continue
    }
    if (arg === "--sample") {
      config.sampleName = nextArg
      i += 1
      continue
    }
    if (arg === "--section-expansion-hops") {
      config.sectionExpansionHops = Number.parseInt(nextArg, 10)
      i += 1
      continue
    }
    if (arg === "--max-target-region-attempts") {
      config.maxTargetRegionAttempts = Number.parseInt(nextArg, 10)
      i += 1
      continue
    }
    if (arg === "--max-section-attempts") {
      config.maxSectionAttempts = Number.parseInt(nextArg, 10)
      i += 1
      continue
    }
    if (arg === "--min-central-region-cost") {
      config.minCentralRegionCost = Number.parseFloat(nextArg)
      i += 1
      continue
    }
    if (arg === "--effort") {
      config.effort = Number.parseFloat(nextArg)
      i += 1
      continue
    }
    if (arg === "--intersection-penalty") {
      config.intersectionPenalty = Number.parseFloat(nextArg)
      i += 1
    }
  }

  return config
}

const datasetDir = path.join(
  import.meta.dir,
  "../datasets/dataset01-hypergraphs",
)
const svgOutputDir = path.join(
  import.meta.dir,
  "../tmp/section-benchmark-dataset01-hypergraphs",
)

const readManifest = (): Manifest =>
  JSON.parse(readFileSync(path.join(datasetDir, "manifest.json"), "utf8"))

const loadSample = (sampleName: string): SerializedHyperGraph =>
  JSON.parse(
    readFileSync(path.join(datasetDir, `${sampleName}.hg.json`), "utf8"),
  ) as SerializedHyperGraph

const createBaselineSolver = (
  sample: SerializedHyperGraph,
  intersectionPenalty: number,
) => {
  const graph = prepareGeometricHyperGraphForSolver(
    convertSerializedHyperGraphToHyperGraph(sample),
  )
  const connections = sample.connections ?? []
  const solvedRoutes = convertSerializedSolvedRoutesToSolvedRoutes(
    sample.solvedRoutes ?? [],
    graph,
  )

  for (const region of graph.regions) {
    region.assignments = []
  }
  for (const port of graph.ports) {
    port.assignment = undefined
  }

  return new ArrayGeometricHyperGraphSolver({
    inputGraph: graph,
    inputConnections: connections,
    inputSolvedRoutes: solvedRoutes,
    intersectionPenalty,
  })
}

const scoreSerializedSample = (
  sample: SerializedHyperGraph,
  intersectionPenalty: number,
) => {
  const solver = createBaselineSolver(sample, intersectionPenalty)

  return {
    solver,
    graph: solver.graph,
    connections: solver.connections,
    solvedRoutes: solver.solvedRoutes,
    intersections: countCommittedGeometricRouteIntersections(
      solver.graph as any,
    ),
    score: computeCommittedGeometricIntersectionPenaltyCost(
      solver.graph as any,
      intersectionPenalty,
    ),
  }
}

const main = async () => {
  const config = parseArgs()
  const manifest = readManifest()
  mkdirSync(svgOutputDir, { recursive: true })

  let samples = manifest.samples
  if (config.sampleName) {
    samples = samples.filter(
      (sample) => sample.sampleName === config.sampleName,
    )
  }
  if (config.limit !== undefined) {
    samples = samples.slice(0, config.limit)
  }

  console.log(
    `Benchmarking ${samples.length} sample(s) from ${datasetDir} with intersectionPenalty=${config.intersectionPenalty}, sectionExpansionHops=${config.sectionExpansionHops}, maxSectionAttempts=${config.maxSectionAttempts}`,
  )

  let improvedSamples = 0
  let unchangedSamples = 0
  let erroredSamples = 0
  let totalBeforeIntersections = 0
  let totalAfterIntersections = 0
  let totalBeforeScore = 0
  let totalAfterScore = 0

  for (const sampleEntry of samples) {
    let before: ReturnType<typeof scoreSerializedSample> | null = null

    try {
      const sample = loadSample(sampleEntry.sampleName)
      before = scoreSerializedSample(sample, config.intersectionPenalty)

      totalBeforeIntersections += before.intersections
      totalBeforeScore += before.score

      if (before.intersections === 0) {
        totalAfterIntersections += before.intersections
        totalAfterScore += before.score
        unchangedSamples += 1
        console.log(
          `${sampleEntry.sampleName}: before=${before.intersections}/${before.score} after=${before.intersections}/${before.score} delta=0 skipped=no-intersections`,
        )
        continue
      }

      activeIntersectionPenalty = config.intersectionPenalty
      const optimizer = new IntersectionPenaltySectionOptimizer({
        // Root and subsolvers read this through the module-scoped active value.
        inputGraph: {
          ports: sample.ports,
          regions: sample.regions,
        },
        inputConnections: sample.connections ?? [],
        inputSolvedRoutes: sample.solvedRoutes ?? [],
        sectionExpansionHops: config.sectionExpansionHops,
        maxTargetRegionAttempts: config.maxTargetRegionAttempts,
        maxSectionAttempts: config.maxSectionAttempts,
        minCentralRegionCost: config.minCentralRegionCost,
        effort: config.effort,
      })

      optimizer.solve()

      const afterIntersections = countCommittedGeometricRouteIntersections(
        optimizer.graph as any,
      )
      const afterScore = computeCommittedGeometricIntersectionPenaltyCost(
        optimizer.graph as any,
        config.intersectionPenalty,
      )
      const improved = afterScore < before.score
      const canWriteSvg = improved && !optimizer.failed

      totalAfterIntersections += afterIntersections
      totalAfterScore += afterScore

      if (improved) {
        improvedSamples += 1
      } else {
        unchangedSamples += 1
      }

      if (canWriteSvg) {
        const stackedSvg = await stackSvgsVertically(
          [
            getSvgFromGraphicsObject(
              renderSolvedGraphGraphics({
                stageLabel: "Before",
                graph: before.solver.graph,
                connections: before.solver.connections,
                solvedRoutes: before.solver.solvedRoutes,
              }),
            ),
            getSvgFromGraphicsObject(
              renderSolvedGraphGraphics({
                stageLabel: "After",
                graph: optimizer.graph,
                connections: optimizer.connections,
                solvedRoutes: optimizer.solvedRoutes,
              }),
            ),
          ],
          {
            gap: 24,
            normalizeSize: false,
          },
        )
        writeFileSync(
          path.join(svgOutputDir, `${sampleEntry.sampleName}.before-after.svg`),
          stackedSvg,
        )
      }

      console.log(
        `${sampleEntry.sampleName}: before=${before.intersections}/${before.score} after=${afterIntersections}/${afterScore} delta=${afterScore - before.score} solved=${optimizer.solved} failed=${optimizer.failed}${canWriteSvg ? " svg=written" : ""}`,
      )
    } catch (error) {
      if (before) {
        totalAfterIntersections += before.intersections
        totalAfterScore += before.score
        unchangedSamples += 1
      }
      erroredSamples += 1
      console.log(
        `${sampleEntry.sampleName}: before=${before?.intersections ?? "?"}/${before?.score ?? "?"} after=${before?.intersections ?? "?"}/${before?.score ?? "?"} delta=0 error=${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  console.log("")
  console.log(
    `Summary: improved=${improvedSamples} unchanged=${unchangedSamples} errored=${erroredSamples} totalBefore=${totalBeforeIntersections}/${totalBeforeScore} totalAfter=${totalAfterIntersections}/${totalAfterScore} delta=${totalAfterScore - totalBeforeScore}`,
  )
}

await main()

function renderSolvedGraphGraphics(input: {
  stageLabel: "Before" | "After"
  graph: ArrayGeometricHyperGraphSolver["graph"]
  connections: Connection[]
  solvedRoutes: SolvedRoute[]
}) {
  const graphics = visualizeJumperGraphWithSolvedRoutes({
    graph: input.graph as any,
    connections: input.connections,
    solvedRoutes: input.solvedRoutes,
    hideRegionPortLines: true,
    title: `${input.stageLabel} optimization`,
  }) as Required<GraphicsObject>
  const markers = getCommittedGeometricIntersectionMarkers(
    input.graph as GeometricHyperGraph,
  )
  const bounds = getGraphBounds(input.graph as GeometricHyperGraph)
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1)
  const markerRadius = Math.max(span * 0.006, 0.08)
  const textMargin = span * 0.03
  const fontSize = Math.max(span * 0.03, 0.45)

  for (const marker of markers) {
    graphics.circles.push({
      center: marker,
      radius: markerRadius,
      fill: "rgba(220, 20, 20, 0.92)",
      stroke: "rgba(255, 255, 255, 0.9)",
      strokeWidth: markerRadius * 0.25,
    } as any)
  }

  graphics.texts.push({
    x: bounds.maxX - textMargin,
    y: bounds.maxY - textMargin,
    text: `${input.stageLabel}\nIntersections: ${markers.length}`,
    fontSize,
    anchorSide: "top_right",
    color: "rgba(120, 0, 0, 0.95)",
  } as any)

  return graphics
}

function getGraphBounds(graph: GeometricHyperGraph) {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const region of graph.regions) {
    minX = Math.min(minX, region.d.bounds.minX)
    maxX = Math.max(maxX, region.d.bounds.maxX)
    minY = Math.min(minY, region.d.bounds.minY)
    maxY = Math.max(maxY, region.d.bounds.maxY)
  }

  if (!Number.isFinite(minX)) {
    return {
      minX: 0,
      maxX: 1,
      minY: 0,
      maxY: 1,
    }
  }

  return { minX, maxX, minY, maxY }
}
