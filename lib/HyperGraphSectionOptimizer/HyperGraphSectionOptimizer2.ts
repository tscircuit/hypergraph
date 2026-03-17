import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import { convertConnectionsToSerializedConnections } from "../convertConnectionsToSerializedConnections"
import { convertHyperGraphToSerializedHyperGraph } from "../convertHyperGraphToSerializedHyperGraph"
import { convertSerializedHyperGraphToHyperGraph } from "../convertSerializedHyperGraphToHyperGraph"
import { convertSerializedSolvedRoutesToSolvedRoutes } from "../convertSerializedSolvedRoutesToSolvedRoutes"
import { convertSolvedRoutesToSerializedSolvedRoutes } from "../convertSolvedRoutesToSerializedSolvedRoutes"
import { createBlankHyperGraph } from "../createBlankHyperGraph"
import { extractSectionOfHyperGraph } from "../extractSectionOfHyperGraph"
import type { HyperGraphSolver } from "../HyperGraphSolver"
import { pruneDeadEndPorts } from "../pruneDeadEndPorts"
import { reattachSectionToGraph } from "../reattachSectionToGraph"
import { commitSolvedRoutes } from "../solvedRoutes"
import type {
  Connection,
  HyperGraph,
  Region,
  RegionId,
  RegionPort,
  SerializedConnection,
  SerializedHyperGraph,
  SolvedRoute,
} from "../types"

export type CreateSectionSolverInput = {
  inputGraph: HyperGraph | SerializedHyperGraph
  inputConnections: (Connection | SerializedConnection)[]
  inputSolvedRoutes: SolvedRoute[]
}

export type CreateSectionSolver = (
  input: CreateSectionSolverInput,
) => HyperGraphSolver<Region, RegionPort>

export type HyperGraphSectionOptimizer2Input = {
  sourceSolver?: HyperGraphSolver<Region, RegionPort>
  currentSolvedRoutes?: SolvedRoute[]
  sectionExpansionHops?: number
  createSectionSolver?: CreateSectionSolver
  maxTargetRegionAttempts?: number
  maxSectionAttempts?: number
  minCentralRegionCost?: number
  effort?: number

  hyperGraphSolver?: HyperGraphSolver<Region, RegionPort>
  inputSolvedRoutes?: SolvedRoute[]
  expansionHopsFromCentralRegion?: number
  createHyperGraphSolver?: CreateSectionSolver
  MAX_ATTEMPTS_PER_REGION?: number
  MAX_ATTEMPTS_PER_SECTION?: number
  ACCEPTABLE_CENTRAL_REGION_COST?: number
}

type NormalizedHyperGraphSectionOptimizer2Input = {
  sourceSolver: HyperGraphSolver<Region, RegionPort>
  currentSolvedRoutes: SolvedRoute[]
  sectionExpansionHops: number
  createSectionSolver: CreateSectionSolver
  maxTargetRegionAttempts: number
  maxSectionAttempts: number
  minCentralRegionCost: number
  effort: number
}

type SectionSolveAttempt = {
  targetRegionId: RegionId
  sectionRegionIds: Set<RegionId>
  fullGraphSnapshot: SerializedHyperGraph
  extractedSection: SerializedHyperGraph
  blankSectionProblem: SerializedHyperGraph
  currentSectionCost: number
}

export class HyperGraphSectionOptimizer2 extends BaseSolver {
  readonly config: NormalizedHyperGraphSectionOptimizer2Input
  graph: HyperGraph
  connections: Connection[]
  solvedRoutes: SolvedRoute[]
  activeAttempt: SectionSolveAttempt | null = null
  targetRegionAttemptCounts = new Map<RegionId, number>()
  attemptedSectionCount = 0

  declare activeSubSolver: HyperGraphSolver<Region, RegionPort> | null

  constructor(input: HyperGraphSectionOptimizer2Input) {
    super()
    this.config = normalizeInput(input)
    this.graph = this.config.sourceSolver.graph
    this.connections = this.config.sourceSolver.connections
    this.solvedRoutes = commitSolvedRoutes({
      graph: this.graph,
      connections: this.connections,
      solvedRoutes: this.config.currentSolvedRoutes,
    })
    this.MAX_ITERATIONS = Math.ceil(this.MAX_ITERATIONS * this.config.effort)
  }

  override getSolverName(): string {
    return "HyperGraphSectionOptimizer2"
  }

  override getConstructorParams() {
    return {
      sourceSolver: this.config.sourceSolver,
      currentSolvedRoutes: this.solvedRoutes,
      sectionExpansionHops: this.config.sectionExpansionHops,
      createSectionSolver: this.config.createSectionSolver,
      maxTargetRegionAttempts: this.config.maxTargetRegionAttempts,
      maxSectionAttempts: this.config.maxSectionAttempts,
      minCentralRegionCost: this.config.minCentralRegionCost,
      effort: this.config.effort,
    }
  }

  override getOutput() {
    return this.solvedRoutes
  }

  override _setup() {
    this.startNextSectionAttempt()
  }

  override visualize(): GraphicsObject {
    if (this.activeSubSolver) {
      return this.activeSubSolver.visualize()
    }

    return {
      title: "HyperGraphSectionOptimizer2",
      points: [],
      lines: [],
      rects: [],
      circles: [],
      texts: [],
      polygons: [],
      arrows: [],
    }
  }

  getCostOfCentralRegion(region: Region): number {
    const attempts = this.targetRegionAttemptCounts.get(region.regionId) ?? 0
    return this.getRegionSolutionCost(this.config.sourceSolver, region) + attempts * 10_000
  }

  getSectionCost(input: {
    solvedGraph: SerializedHyperGraph
    sectionRegionIds: Set<RegionId>
  }): number {
    const solvedRoutes = this.deserializeSolvedRoutes(input.solvedGraph)
    const sectionSolver = this.config.createSectionSolver({
      inputGraph: input.solvedGraph,
      inputConnections: input.solvedGraph.connections ?? [],
      inputSolvedRoutes: solvedRoutes,
    })

    let totalCost = 0
    for (const region of sectionSolver.graph.regions) {
      if (!input.sectionRegionIds.has(region.regionId)) continue
      totalCost += this.getRegionSolutionCost(sectionSolver, region)
    }
    return totalCost
  }

  override _step() {
    if (!this.activeSubSolver) {
      this.startNextSectionAttempt()
      return
    }

    this.activeSubSolver.step()

    if (!this.activeAttempt) {
      return
    }

    if (this.activeSubSolver.failed) {
      this.rejectActiveAttempt()
      return
    }

    if (!this.activeSubSolver.solved) {
      return
    }

    const solvedBlankSection = {
      ...this.activeAttempt.blankSectionProblem,
      solvedRoutes: convertSolvedRoutesToSerializedSolvedRoutes(
        this.activeSubSolver.solvedRoutes,
      ),
    }
    const mergedGraph = reattachSectionToGraph({
      fullGraph: this.activeAttempt.fullGraphSnapshot,
      solvedSectionGraph: solvedBlankSection,
    })
    const mergedSectionCost = this.getSectionCost({
      solvedGraph: mergedGraph,
      sectionRegionIds: this.activeAttempt.sectionRegionIds,
    })

    if (mergedSectionCost < this.activeAttempt.currentSectionCost) {
      this.acceptMergedGraph(mergedGraph)
      return
    }

    this.rejectActiveAttempt()
  }

  private startNextSectionAttempt() {
    if (this.attemptedSectionCount >= this.config.maxSectionAttempts) {
      this.solved = true
      return
    }

    const targetRegion = this.selectTargetRegion()
    if (!targetRegion) {
      this.solved = true
      return
    }

    this.attemptedSectionCount += 1

    const nextAttempt = this.createSectionSolveAttempt(targetRegion)
    if (!nextAttempt) {
      this.bumpTargetRegionAttemptCount(targetRegion.regionId)
      return
    }

    this.activeAttempt = nextAttempt
    this.activeSubSolver = this.config.createSectionSolver({
      inputGraph: nextAttempt.blankSectionProblem,
      inputConnections: nextAttempt.blankSectionProblem.connections ?? [],
      inputSolvedRoutes: [],
    })
  }

  private selectTargetRegion(): Region | null {
    let bestRegion: Region | null = null
    let bestCost = Infinity

    for (const region of this.graph.regions) {
      if ((region.assignments?.length ?? 0) === 0) continue
      if (
        (this.targetRegionAttemptCounts.get(region.regionId) ?? 0) >=
        this.config.maxTargetRegionAttempts
      ) {
        continue
      }

      const cost = this.getCostOfCentralRegion(region)
      if (cost <= this.config.minCentralRegionCost) continue
      if (cost >= bestCost) continue
      bestCost = cost
      bestRegion = region
    }

    return bestRegion
  }

  private createSectionSolveAttempt(targetRegion: Region): SectionSolveAttempt | null {
    const fullGraphSnapshot = this.serializeSolvedGraph()
    const extractedSection = extractSectionOfHyperGraph({
      graph: fullGraphSnapshot,
      centralRegionId: targetRegion.regionId,
      expansionHopsFromCentralRegion: this.config.sectionExpansionHops,
    })
    const prunedSection = this.pruneSectionForBlanking(extractedSection)

    if ((prunedSection.connections?.length ?? 0) === 0) {
      return null
    }

    return {
      targetRegionId: targetRegion.regionId,
      sectionRegionIds: this.getSectionRegionIds(extractedSection),
      fullGraphSnapshot,
      extractedSection,
      blankSectionProblem: createBlankHyperGraph(prunedSection),
      currentSectionCost: this.getSectionCost({
        solvedGraph: fullGraphSnapshot,
        sectionRegionIds: this.getSectionRegionIds(extractedSection),
      }),
    }
  }

  private acceptMergedGraph(mergedGraph: SerializedHyperGraph) {
    this.solvedRoutes = this.deserializeSolvedRoutes(mergedGraph)
    const sourceSolver = this.config.sourceSolver
    sourceSolver.solvedRoutes = commitSolvedRoutes({
      graph: sourceSolver.graph,
      connections: sourceSolver.connections,
      solvedRoutes: this.solvedRoutes,
    })
    this.solvedRoutes = sourceSolver.solvedRoutes

    for (const regionId of this.activeAttempt?.sectionRegionIds ?? []) {
      this.targetRegionAttemptCounts.set(regionId, 0)
    }

    this.clearActiveAttempt()
  }

  private rejectActiveAttempt() {
    if (this.activeSubSolver?.failed) {
      this.failedSubSolvers ??= []
      this.failedSubSolvers.push(this.activeSubSolver)
    }

    if (this.activeAttempt) {
      this.bumpTargetRegionAttemptCount(this.activeAttempt.targetRegionId)
    }

    this.clearActiveAttempt()
  }

  private clearActiveAttempt() {
    this.activeSubSolver = null
    this.activeAttempt = null
  }

  private bumpTargetRegionAttemptCount(regionId: RegionId) {
    this.targetRegionAttemptCounts.set(
      regionId,
      (this.targetRegionAttemptCounts.get(regionId) ?? 0) + 1,
    )
  }

  private serializeSolvedGraph(): SerializedHyperGraph {
    return {
      ...convertHyperGraphToSerializedHyperGraph(this.graph),
      connections: convertConnectionsToSerializedConnections(this.connections),
      solvedRoutes: convertSolvedRoutesToSerializedSolvedRoutes(this.solvedRoutes),
    }
  }

  private deserializeSolvedRoutes(graph: SerializedHyperGraph): SolvedRoute[] {
    if (!graph.solvedRoutes) return []

    return convertSerializedSolvedRoutesToSolvedRoutes(
      graph.solvedRoutes,
      convertSerializedHyperGraphToHyperGraph(graph),
    )
  }

  private getSectionRegionIds(sectionGraph: SerializedHyperGraph): Set<RegionId> {
    const fullRegionIds = new Set(this.graph.regions.map((region) => region.regionId))
    return new Set(
      sectionGraph.regions
        .map((region) => region.regionId)
        .filter((regionId) => fullRegionIds.has(regionId)),
    )
  }

  private pruneSectionForBlanking(
    extractedSection: SerializedHyperGraph,
  ): SerializedHyperGraph {
    const mutableSectionGraph = convertSerializedHyperGraphToHyperGraph(
      extractedSection,
    )
    const retainedPortIds =
      extractedSection.solvedRoutes?.flatMap((solvedRoute) => {
        const firstPortId = solvedRoute.path[0]?.portId
        const lastPortId = solvedRoute.path[solvedRoute.path.length - 1]?.portId
        return [firstPortId, lastPortId].filter(
          (portId): portId is string => Boolean(portId),
        )
      }) ?? []

    pruneDeadEndPorts(mutableSectionGraph, retainedPortIds)

    return {
      ...convertHyperGraphToSerializedHyperGraph(mutableSectionGraph),
      connections: extractedSection.connections
        ? structuredClone(extractedSection.connections)
        : undefined,
      solvedRoutes: extractedSection.solvedRoutes
        ? structuredClone(extractedSection.solvedRoutes)
        : undefined,
      _sectionCentralRegionId: extractedSection._sectionCentralRegionId,
      _sectionRouteBindings: extractedSection._sectionRouteBindings
        ? structuredClone(extractedSection._sectionRouteBindings)
        : undefined,
    }
  }

  private getRegionSolutionCost(
    solver: HyperGraphSolver<Region, RegionPort>,
    region: Region,
  ): number {
    const previousConnection = solver.currentConnection
    let totalCost = 0

    for (const assignment of region.assignments ?? []) {
      solver.currentConnection = assignment.connection
      totalCost += solver.computeIncreasedRegionCostIfPortsAreUsed(
        region,
        assignment.regionPort1,
        assignment.regionPort2,
      )
    }

    solver.currentConnection = previousConnection
    return totalCost
  }
}

const normalizeInput = (
  input: HyperGraphSectionOptimizer2Input,
): NormalizedHyperGraphSectionOptimizer2Input => {
  const sourceSolver = input.sourceSolver ?? input.hyperGraphSolver
  const currentSolvedRoutes = input.currentSolvedRoutes ?? input.inputSolvedRoutes
  const sectionExpansionHops =
    input.sectionExpansionHops ?? input.expansionHopsFromCentralRegion
  const createSectionSolver =
    input.createSectionSolver ?? input.createHyperGraphSolver
  const maxTargetRegionAttempts =
    input.maxTargetRegionAttempts ?? input.MAX_ATTEMPTS_PER_REGION

  if (!sourceSolver) {
    throw new Error("HyperGraphSectionOptimizer2 requires sourceSolver")
  }
  if (!currentSolvedRoutes) {
    throw new Error("HyperGraphSectionOptimizer2 requires currentSolvedRoutes")
  }
  if (sectionExpansionHops === undefined) {
    throw new Error("HyperGraphSectionOptimizer2 requires sectionExpansionHops")
  }
  if (!createSectionSolver) {
    throw new Error("HyperGraphSectionOptimizer2 requires createSectionSolver")
  }
  if (maxTargetRegionAttempts === undefined) {
    throw new Error(
      "HyperGraphSectionOptimizer2 requires maxTargetRegionAttempts",
    )
  }

  return {
    sourceSolver,
    currentSolvedRoutes,
    sectionExpansionHops,
    createSectionSolver,
    maxTargetRegionAttempts,
    maxSectionAttempts:
      input.maxSectionAttempts ?? input.MAX_ATTEMPTS_PER_SECTION ?? 500,
    minCentralRegionCost:
      input.minCentralRegionCost ?? input.ACCEPTABLE_CENTRAL_REGION_COST ?? 0,
    effort: input.effort ?? 1,
  }
}
