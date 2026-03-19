import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import { convertConnectionsToSerializedConnections } from "../convertConnectionsToSerializedConnections"
import { convertHyperGraphToSerializedHyperGraph } from "../convertHyperGraphToSerializedHyperGraph"
import { convertSerializedHyperGraphToHyperGraph } from "../convertSerializedHyperGraphToHyperGraph"
import { convertSerializedSolvedRoutesToSolvedRoutes } from "../convertSerializedSolvedRoutesToSolvedRoutes"
import { convertSolvedRoutesToSerializedSolvedRoutes } from "../convertSolvedRoutesToSerializedSolvedRoutes"
import { createBlankHyperGraph } from "../createBlankHyperGraph"
import { extractSectionOfHyperGraph } from "../extractSectionOfHyperGraph"
import { HyperGraphSolver } from "../HyperGraphSolver"
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
  SerializedSolvedRoute,
  SolvedRoute,
} from "../types"

export type CreateSectionSolverInput = {
  inputGraph: SerializedHyperGraph
  inputConnections: SerializedConnection[]
  inputSolvedRoutes: SerializedSolvedRoute[]
}

export type HyperGraphSectionOptimizer2Input = {
  inputGraph: SerializedHyperGraph
  inputConnections?: SerializedConnection[]
  inputSolvedRoutes?: SerializedSolvedRoute[]
  sectionExpansionHops?: number
  maxTargetRegionAttempts?: number
  maxSectionAttempts?: number
  minCentralRegionCost?: number
  effort?: number

  expansionHopsFromCentralRegion?: number
  MAX_ATTEMPTS_PER_REGION?: number
  MAX_ATTEMPTS_PER_SECTION?: number
  ACCEPTABLE_CENTRAL_REGION_COST?: number
  ACCEPTABLE_CENTRAL_REGION_COST_START?: number
  ACCEPTABLE_CENTRAL_REGION_COST_END?: number
}

type NormalizedHyperGraphSectionOptimizer2Input = {
  inputGraph: SerializedHyperGraph
  inputConnections: SerializedConnection[]
  inputSolvedRoutes: SerializedSolvedRoute[]
  sectionExpansionHops: number
  maxTargetRegionAttempts: number
  maxSectionAttempts: number
  minCentralRegionCost: number
  centralRegionCostStart?: number
  centralRegionCostEnd?: number
  effort: number
}

type SectionSolveAttempt = {
  targetRegionId: RegionId
  sectionRegionIds: Set<RegionId>
  fullGraphSnapshot: SerializedHyperGraph
  blankSectionProblem: SerializedHyperGraph
  currentSectionCost: number
}

export class HyperGraphSectionOptimizer2 extends BaseSolver {
  readonly config: NormalizedHyperGraphSectionOptimizer2Input
  readonly rootSolver: HyperGraphSolver<Region, RegionPort>
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
    this.rootSolver = this.createHyperGraphSolver({
      inputGraph: this.config.inputGraph,
      inputConnections: this.config.inputConnections,
      inputSolvedRoutes: this.config.inputSolvedRoutes,
    })
    this.graph = this.rootSolver.graph
    this.connections = this.rootSolver.connections
    this.solvedRoutes = this.rootSolver.solvedRoutes
    this.MAX_ITERATIONS = Math.ceil(this.MAX_ITERATIONS * this.config.effort)
  }

  override getSolverName(): string {
    return "HyperGraphSectionOptimizer2"
  }

  override getConstructorParams() {
    return {
      inputGraph: convertHyperGraphToSerializedHyperGraph(this.graph),
      inputConnections: convertConnectionsToSerializedConnections(
        this.connections,
      ),
      inputSolvedRoutes: convertSolvedRoutesToSerializedSolvedRoutes(
        this.solvedRoutes,
      ),
      sectionExpansionHops: this.config.sectionExpansionHops,
      maxTargetRegionAttempts: this.config.maxTargetRegionAttempts,
      maxSectionAttempts: this.config.maxSectionAttempts,
      minCentralRegionCost: this.config.minCentralRegionCost,
      ACCEPTABLE_CENTRAL_REGION_COST_START: this.config.centralRegionCostStart,
      ACCEPTABLE_CENTRAL_REGION_COST_END: this.config.centralRegionCostEnd,
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

  protected createHyperGraphSolver(
    input: CreateSectionSolverInput,
  ): HyperGraphSolver<Region, RegionPort> {
    const graph = convertSerializedHyperGraphToHyperGraph(input.inputGraph)
    return new HyperGraphSolver({
      inputGraph: graph,
      inputConnections: input.inputConnections,
      inputSolvedRoutes: convertSerializedSolvedRoutesToSolvedRoutes(
        input.inputSolvedRoutes,
        graph,
      ),
    })
  }

  getCostOfCentralRegion(region: Region): number {
    const attempts = this.targetRegionAttemptCounts.get(region.regionId) ?? 0
    return (
      this.getRegionSolutionCost(this.rootSolver, region) + attempts * 10_000
    )
  }

  getSectionCost(input: {
    solvedGraph: SerializedHyperGraph
    sectionRegionIds: Set<RegionId>
  }): number {
    const sectionSolver = this.createHyperGraphSolver({
      inputGraph: input.solvedGraph,
      inputConnections: input.solvedGraph.connections ?? [],
      inputSolvedRoutes: input.solvedGraph.solvedRoutes ?? [],
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

    if (!this.activeAttempt) return

    if (this.activeSubSolver.failed) {
      this.rejectActiveAttempt()
      return
    }

    if (!this.activeSubSolver.solved) return

    const solvedBlankSection: SerializedHyperGraph = {
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
    this.activeSubSolver = this.createHyperGraphSolver({
      inputGraph: nextAttempt.blankSectionProblem,
      inputConnections: nextAttempt.blankSectionProblem.connections ?? [],
      inputSolvedRoutes: [],
    })
  }

  private selectTargetRegion(): Region | null {
    let bestRegion: Region | null = null
    let bestCost = Infinity
    const minCentralRegionCost = this.getMinCentralRegionCost()

    for (const region of this.graph.regions) {
      if ((region.assignments?.length ?? 0) === 0) continue
      if (
        (this.targetRegionAttemptCounts.get(region.regionId) ?? 0) >=
        this.config.maxTargetRegionAttempts
      ) {
        continue
      }

      const cost = this.getCostOfCentralRegion(region)
      if (cost <= minCentralRegionCost) continue
      if (cost >= bestCost) continue
      bestCost = cost
      bestRegion = region
    }

    return bestRegion
  }

  protected getMinCentralRegionCost(): number {
    const { centralRegionCostStart, centralRegionCostEnd } = this.config
    if (
      centralRegionCostStart === undefined ||
      centralRegionCostEnd === undefined
    ) {
      return this.config.minCentralRegionCost
    }

    return this.interpolateCentralRegionCost(
      centralRegionCostStart,
      centralRegionCostEnd,
    )
  }

  private interpolateCentralRegionCost(start: number, end: number): number {
    const attemptsToMax = Math.max(1, this.config.maxSectionAttempts - 1)
    const progress = Math.min(1, this.attemptedSectionCount / attemptsToMax)
    return start + (end - start) * progress
  }

  private createSectionSolveAttempt(
    targetRegion: Region,
  ): SectionSolveAttempt | null {
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

    const sectionRegionIds = this.getSectionRegionIds(extractedSection)
    return {
      targetRegionId: targetRegion.regionId,
      sectionRegionIds,
      fullGraphSnapshot,
      blankSectionProblem: createBlankHyperGraph(prunedSection),
      currentSectionCost: this.getSectionCost({
        solvedGraph: fullGraphSnapshot,
        sectionRegionIds,
      }),
    }
  }

  private acceptMergedGraph(mergedGraph: SerializedHyperGraph) {
    this.rootSolver.solvedRoutes = commitSolvedRoutes({
      graph: this.rootSolver.graph,
      connections: this.rootSolver.connections,
      solvedRoutes: this.deserializeSolvedRoutes(mergedGraph),
    })
    this.solvedRoutes = this.rootSolver.solvedRoutes
    this.graph = this.rootSolver.graph
    this.connections = this.rootSolver.connections

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
      solvedRoutes: convertSolvedRoutesToSerializedSolvedRoutes(
        this.solvedRoutes,
      ),
    }
  }

  private deserializeSolvedRoutes(graph: SerializedHyperGraph): SolvedRoute[] {
    if (!graph.solvedRoutes) return []
    return convertSerializedSolvedRoutesToSolvedRoutes(
      graph.solvedRoutes,
      convertSerializedHyperGraphToHyperGraph(graph),
    )
  }

  private getSectionRegionIds(
    sectionGraph: SerializedHyperGraph,
  ): Set<RegionId> {
    const fullRegionIds = new Set(
      this.graph.regions.map((region) => region.regionId),
    )
    return new Set(
      sectionGraph.regions
        .map((region) => region.regionId)
        .filter((regionId) => fullRegionIds.has(regionId)),
    )
  }

  private pruneSectionForBlanking(
    extractedSection: SerializedHyperGraph,
  ): SerializedHyperGraph {
    const mutableSectionGraph =
      convertSerializedHyperGraphToHyperGraph(extractedSection)
    const retainedPortIds =
      extractedSection.solvedRoutes?.flatMap((solvedRoute) => {
        const firstPortId = solvedRoute.path[0]?.portId
        const lastPortId = solvedRoute.path[solvedRoute.path.length - 1]?.portId
        return [firstPortId, lastPortId].filter((portId): portId is string =>
          Boolean(portId),
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
  const inputConnections =
    input.inputConnections ?? input.inputGraph.connections
  const inputSolvedRoutes =
    input.inputSolvedRoutes ?? input.inputGraph.solvedRoutes
  const sectionExpansionHops =
    input.sectionExpansionHops ?? input.expansionHopsFromCentralRegion
  const maxTargetRegionAttempts =
    input.maxTargetRegionAttempts ?? input.MAX_ATTEMPTS_PER_REGION

  if (!inputConnections) {
    throw new Error("HyperGraphSectionOptimizer2 requires inputConnections")
  }
  if (!inputSolvedRoutes) {
    throw new Error("HyperGraphSectionOptimizer2 requires inputSolvedRoutes")
  }
  if (sectionExpansionHops === undefined) {
    throw new Error("HyperGraphSectionOptimizer2 requires sectionExpansionHops")
  }
  if (maxTargetRegionAttempts === undefined) {
    throw new Error(
      "HyperGraphSectionOptimizer2 requires maxTargetRegionAttempts",
    )
  }

  const acceptableCentralRegionCostStart =
    input.ACCEPTABLE_CENTRAL_REGION_COST_START
  const acceptableCentralRegionCostEnd =
    input.ACCEPTABLE_CENTRAL_REGION_COST_END

  if (
    (acceptableCentralRegionCostStart === undefined) !==
    (acceptableCentralRegionCostEnd === undefined)
  ) {
    throw new Error(
      "HyperGraphSectionOptimizer2 requires both ACCEPTABLE_CENTRAL_REGION_COST_START and ACCEPTABLE_CENTRAL_REGION_COST_END",
    )
  }

  return {
    inputGraph: {
      ...input.inputGraph,
      connections: undefined,
      solvedRoutes: undefined,
    },
    inputConnections: structuredClone(inputConnections),
    inputSolvedRoutes: structuredClone(inputSolvedRoutes),
    sectionExpansionHops,
    maxTargetRegionAttempts,
    maxSectionAttempts:
      input.maxSectionAttempts ?? input.MAX_ATTEMPTS_PER_SECTION ?? 500,
    minCentralRegionCost:
      input.minCentralRegionCost ?? input.ACCEPTABLE_CENTRAL_REGION_COST ?? 0,
    centralRegionCostStart: acceptableCentralRegionCostStart,
    centralRegionCostEnd: acceptableCentralRegionCostEnd,
    effort: input.effort ?? 1,
  }
}
