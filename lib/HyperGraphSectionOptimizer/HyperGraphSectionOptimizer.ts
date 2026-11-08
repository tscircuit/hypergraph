import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import { convertConnectionsToSerializedConnections } from "../convertConnectionsToSerializedConnections"
import { convertHyperGraphToSerializedHyperGraph } from "../convertHyperGraphToSerializedHyperGraph"
import { convertSerializedConnectionsToConnections } from "../convertSerializedConnectionsToConnections"
import { convertSerializedHyperGraphToHyperGraph } from "../convertSerializedHyperGraphToHyperGraph"
import { convertSerializedSolvedRoutesToSolvedRoutes } from "../convertSerializedSolvedRoutesToSolvedRoutes"
import { HyperGraphSolver } from "../HyperGraphSolver"
import { createSeededRandom } from "../JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"
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
import { previewSectionReplacement } from "./routes/previewSectionReplacement"
import { getSectionOfHyperGraphAsHyperGraph } from "./sections/getSectionOfHyperGraphAsHyperGraph"

export type CreateHyperGraphSolverInput = {
  inputGraph: HyperGraph | SerializedHyperGraph
  inputConnections: (Connection | SerializedConnection)[]
  inputSolvedRoutes: SolvedRoute[]
}

export type CreateHyperGraphSolver = (
  input: CreateHyperGraphSolverInput,
) => HyperGraphSolver<Region, RegionPort>

export type SectionRoute = {
  globalRoute: SolvedRoute
  globalConnection: Connection
  sectionConnection: Connection
  sectionRoute: SolvedRoute
  canRemainFixedInSectionSolve: boolean
  sectionStartIndex: number
  sectionEndIndex: number
}

export type HyperGraphSection = {
  centralRegionId: RegionId
  sectionRegionIds: Set<RegionId>
  graph: HyperGraph
  connections: Connection[]
  sectionRoutes: SectionRoute[]
}

export type HyperGraphSectionOptimizerInput = {
  hyperGraphSolver?: HyperGraphSolver<Region, RegionPort>
  solvedHyperGraph?: HyperGraph | SerializedHyperGraph
  inputGraph?: HyperGraph | SerializedHyperGraph
  inputConnections?: (Connection | SerializedConnection)[]
  inputSolvedRoutes?: (SolvedRoute | SerializedSolvedRoute)[]
  expansionHopsFromCentralRegion: number
  createHyperGraphSolver?: CreateHyperGraphSolver
  regionCost?: (region: Region) => number
  getCostOfCentralRegion?: (region: Region) => number
  computeCostOfSection?: (input: {
    section: HyperGraphSection
    solvedRoutes: SolvedRoute[]
  }) => number
  effort?: number
  ACCEPTABLE_REGION_COST?: number
  ACCEPTABLE_COST?: number
  MAX_ATTEMPTS_PER_REGION?: number
  maxAttemptsPerRegion?: number
  MAX_ATTEMPTS_PER_SECTION?: number
  maxSectionAttempts?: number
  FRACTION_TO_REPLACE?: number
  fractionToReplace?: number
  alwaysRipConflicts?: boolean
  computeSolvedGraphCost?: (solvedRoutes: SolvedRoute[]) => number
}

const isSerializedSolvedRoute = (
  route: SolvedRoute | SerializedSolvedRoute,
): route is SerializedSolvedRoute => {
  const firstStep = route.path[0] as
    | SolvedRoute["path"][number]
    | SerializedSolvedRoute["path"][number]
    | undefined
  return Boolean(firstStep && "portId" in firstStep && !("port" in firstStep))
}

export class HyperGraphSectionOptimizer extends BaseSolver {
  hyperGraphSolver: HyperGraphSolver<Region, RegionPort>
  createHyperGraphSolverFn: CreateHyperGraphSolver
  graph: HyperGraph
  connections: Connection[]
  solvedRoutes: SolvedRoute[]
  activeSection: HyperGraphSection | null = null
  baselineSectionCost = Infinity
  baselineGlobalCost = Infinity
  regionAttemptCounts = new Map<RegionId, number>()
  sectionAttempts = 0
  maxAttemptsPerRegion: number
  maxSectionAttempts: number
  acceptableRegionCost: number
  fractionToReplace: number
  alwaysRipConflicts: boolean
  random: () => number = createSeededRandom(31337)

  declare activeSubSolver: HyperGraphSolver<Region, RegionPort> | null

  constructor(public input: HyperGraphSectionOptimizerInput) {
    super()
    this.createHyperGraphSolverFn =
      input.createHyperGraphSolver ??
      ((solverInput) => new HyperGraphSolver(solverInput))

    if (input.hyperGraphSolver) {
      this.hyperGraphSolver = input.hyperGraphSolver
      this.graph = input.hyperGraphSolver.graph
      this.connections = input.hyperGraphSolver.connections
      const rawRoutes =
        input.inputSolvedRoutes ?? input.hyperGraphSolver.solvedRoutes
      const resolvedRoutes = this.resolveSolvedRoutes(rawRoutes, this.graph)
      this.solvedRoutes = commitSolvedRoutes({
        graph: this.graph,
        connections: this.connections,
        solvedRoutes: resolvedRoutes,
      })
    } else {
      const rawGraph = input.solvedHyperGraph ?? input.inputGraph
      if (!rawGraph) {
        throw new Error(
          "HyperGraphSectionOptimizer requires hyperGraphSolver, solvedHyperGraph, or inputGraph",
        )
      }
      const deserializedGraph =
        convertSerializedHyperGraphToHyperGraph(rawGraph)
      const rawConnections =
        input.inputConnections ??
        (rawGraph as SerializedHyperGraph).connections ??
        []
      const deserializedConnections = convertSerializedConnectionsToConnections(
        rawConnections,
        deserializedGraph,
      )
      const rawRoutes =
        input.inputSolvedRoutes ??
        (rawGraph as SerializedHyperGraph).solvedRoutes ??
        (rawGraph as HyperGraph & { solvedRoutes?: SolvedRoute[] })
          .solvedRoutes ??
        []
      const resolvedRoutes = this.resolveSolvedRoutes(
        rawRoutes,
        deserializedGraph,
      )

      this.hyperGraphSolver = this.createHyperGraphSolverFn({
        inputGraph: deserializedGraph,
        inputConnections: deserializedConnections,
        inputSolvedRoutes: resolvedRoutes,
      })
      this.graph = this.hyperGraphSolver.graph
      this.connections = this.hyperGraphSolver.connections
      this.solvedRoutes = commitSolvedRoutes({
        graph: this.graph,
        connections: this.connections,
        solvedRoutes: resolvedRoutes,
      })
      this.hyperGraphSolver.solvedRoutes = this.solvedRoutes
    }

    this.maxAttemptsPerRegion =
      input.MAX_ATTEMPTS_PER_REGION ?? input.maxAttemptsPerRegion ?? 1
    this.maxSectionAttempts =
      input.MAX_ATTEMPTS_PER_SECTION ?? input.maxSectionAttempts ?? 500
    this.acceptableRegionCost =
      input.ACCEPTABLE_REGION_COST ?? input.ACCEPTABLE_COST ?? 0
    const effort = input.effort ?? 1
    this.MAX_ITERATIONS = Math.ceil(this.MAX_ITERATIONS * effort)
    this.fractionToReplace =
      input.FRACTION_TO_REPLACE ??
      input.fractionToReplace ??
      (input.hyperGraphSolver && input.regionCost ? 0.2 : 1)
    this.alwaysRipConflicts = input.alwaysRipConflicts ?? true
  }

  private resolveSolvedRoutes(
    rawRoutes: (SolvedRoute | SerializedSolvedRoute)[],
    graph: HyperGraph,
  ): SolvedRoute[] {
    if (rawRoutes.length === 0) return []
    if (isSerializedSolvedRoute(rawRoutes[0]!)) {
      return convertSerializedSolvedRoutesToSolvedRoutes(
        rawRoutes as SerializedSolvedRoute[],
        graph,
      )
    }
    return rawRoutes as SolvedRoute[]
  }

  override getSolverName(): string {
    return "HyperGraphSectionOptimizer"
  }

  override getConstructorParams() {
    return {
      inputGraph: convertHyperGraphToSerializedHyperGraph(this.graph),
      inputConnections: convertConnectionsToSerializedConnections(
        this.connections,
      ),
      inputSolvedRoutes: this.solvedRoutes,
      expansionHopsFromCentralRegion: this.input.expansionHopsFromCentralRegion,
      maxAttemptsPerRegion: this.maxAttemptsPerRegion,
      maxSectionAttempts: this.maxSectionAttempts,
      effort: this.input.effort ?? 1,
      fractionToReplace: this.fractionToReplace,
      alwaysRipConflicts: this.alwaysRipConflicts,
      ACCEPTABLE_COST: this.acceptableRegionCost,
    }
  }

  override getOutput() {
    return this.solvedRoutes
  }

  override _setup() {
    this.beginSectionSolve()
  }

  override visualize(): GraphicsObject {
    if (this.activeSubSolver) {
      return this.activeSubSolver.visualize()
    }

    return {
      title: "HyperGraphSectionOptimizer",
      points: [],
      lines: [],
      rects: [],
      circles: [],
      texts: [],
      polygons: [],
      arrows: [],
    }
  }

  protected computeRegionCost(
    region: Region,
    solver: HyperGraphSolver<Region, RegionPort> = this.hyperGraphSolver,
  ): number {
    if (this.input.regionCost) {
      return this.input.regionCost(region)
    }

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

  getCostOfCentralRegion(region: Region): number {
    const attempts = this.regionAttemptCounts.get(region.regionId) ?? 0
    const baseCost = this.input.getCostOfCentralRegion
      ? this.input.getCostOfCentralRegion(region)
      : this.computeRegionCost(region)
    return baseCost + attempts * 10_000
  }

  getCostOfRegionWithAttempts(region: Region): number {
    return this.getCostOfCentralRegion(region)
  }

  computeCostOfSection({
    section,
    solvedRoutes,
  }: {
    section: HyperGraphSection
    solvedRoutes: SolvedRoute[]
  }): number {
    if (this.input.computeCostOfSection) {
      return this.input.computeCostOfSection({ section, solvedRoutes })
    }
    if (this.input.computeSolvedGraphCost) {
      return this.input.computeSolvedGraphCost(solvedRoutes)
    }
    // Default: sum of all region scores in the section
    const solver = this.createHyperGraphSolverFn({
      inputGraph: section.graph,
      inputConnections: section.connections,
      inputSolvedRoutes: solvedRoutes,
    })
    let totalCost = 0
    for (const region of solver.graph.regions) {
      totalCost += this.computeRegionCost(region, solver)
    }
    return totalCost
  }

  private computeSolvedGraphCost(solvedRoutes: SolvedRoute[]): number {
    if (this.input.computeSolvedGraphCost) {
      return this.input.computeSolvedGraphCost(solvedRoutes)
    }
    // Default: sum of all region scores
    const solver = this.createHyperGraphSolverFn({
      inputGraph: this.graph,
      inputConnections: this.connections,
      inputSolvedRoutes: solvedRoutes,
    })
    let totalCost = 0
    for (const region of solver.graph.regions) {
      totalCost += this.computeRegionCost(region, solver)
    }
    return totalCost
  }

  /**
   * TODO default behavior should be to rip entire section
   */
  determineConnectionsToRip(
    section: HyperGraphSection,
    evaluationSolver: HyperGraphSolver<Region, RegionPort>,
  ): Set<string> {
    const allConnectionIds = section.sectionRoutes.map(
      (route) => route.globalConnection.connectionId,
    )
    if (this.fractionToReplace >= 1) {
      return new Set(allConnectionIds)
    }

    const shuffledConnectionIds = [...allConnectionIds]
    for (let index = shuffledConnectionIds.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(this.random() * (index + 1))
      ;[shuffledConnectionIds[index], shuffledConnectionIds[swapIndex]] = [
        shuffledConnectionIds[swapIndex],
        shuffledConnectionIds[index],
      ]
    }
    const ripCount = Math.max(
      1,
      Math.ceil(shuffledConnectionIds.length * this.fractionToReplace),
    )
    const connectionsToReroute = new Set(
      shuffledConnectionIds.slice(0, ripCount),
    )

    if (!this.alwaysRipConflicts) {
      return connectionsToReroute
    }

    const localRegionMap = new Map(
      section.graph.regions.map((region) => [region.regionId, region]),
    )

    for (const route of section.sectionRoutes) {
      for (const candidate of route.sectionRoute.path) {
        if (!candidate.lastPort || !candidate.lastRegion) continue
        const sectionRegion = localRegionMap.get(candidate.lastRegion.regionId)
        if (!sectionRegion) continue

        evaluationSolver.currentConnection = route.globalConnection
        const conflictingAssignments =
          evaluationSolver.getRipsRequiredForPortUsage(
            sectionRegion,
            candidate.lastPort,
            candidate.port,
          )

        for (const conflict of conflictingAssignments) {
          const firstId = route.globalConnection.connectionId
          const secondId = conflict.connection.connectionId
          if (
            connectionsToReroute.has(firstId) ||
            connectionsToReroute.has(secondId)
          ) {
            continue
          }
          connectionsToReroute.add(this.random() < 0.5 ? firstId : secondId)
        }
      }
    }

    return connectionsToReroute
  }

  private getNextCentralRegion(): Region | null {
    let bestRegion: Region | null = null
    let bestCost = Infinity

    for (const region of this.graph.regions) {
      if ((region.assignments?.length ?? 0) === 0) continue
      if (
        (this.regionAttemptCounts.get(region.regionId) ?? 0) >=
        this.maxAttemptsPerRegion
      ) {
        continue
      }

      const regionCost = this.computeRegionCost(region)

      // Skip regions below acceptable threshold
      if (regionCost < this.acceptableRegionCost) continue

      const cost = this.getCostOfCentralRegion(region)
      if (cost >= bestCost) continue
      bestCost = cost
      bestRegion = region
    }

    return bestRegion
  }

  private beginSectionSolve() {
    // Check if we've exceeded max section attempts
    if (this.sectionAttempts >= this.maxSectionAttempts) {
      console.log(
        `Reached max section attempts (${this.maxSectionAttempts}), stopping optimization`,
      )
      this.solved = true
      return
    }

    const centralRegion = this.getNextCentralRegion()
    if (!centralRegion) {
      this.solved = true
      return
    }

    // Increment section attempts counter
    this.sectionAttempts++

    this.activeSection = getSectionOfHyperGraphAsHyperGraph({
      graph: this.graph,
      solvedRoutes: this.solvedRoutes,
      centralRegion,
      expansionHopsFromCentralRegion: this.input.expansionHopsFromCentralRegion,
    })

    if (!this.activeSection) {
      return
    }

    if (this.activeSection.connections.length === 0) {
      this.regionAttemptCounts.set(
        centralRegion.regionId,
        (this.regionAttemptCounts.get(centralRegion.regionId) ?? 0) + 1,
      )
      this.activeSection = null
      return
    }

    const fixedSectionRoutes = this.activeSection.sectionRoutes.filter(
      (route) => route.canRemainFixedInSectionSolve,
    )
    const baselineSolver = this.createHyperGraphSolverFn({
      inputGraph: this.activeSection.graph,
      inputConnections: this.activeSection.connections,
      inputSolvedRoutes: fixedSectionRoutes.map((route) => route.sectionRoute),
    })
    const connectionsToReroute = this.determineConnectionsToRip(
      this.activeSection,
      baselineSolver,
    )
    for (const route of this.activeSection.sectionRoutes) {
      if (!route.canRemainFixedInSectionSolve) {
        connectionsToReroute.add(route.globalConnection.connectionId)
      }
    }
    const remainingSectionRoutes = this.activeSection.sectionRoutes.filter(
      (route) =>
        route.canRemainFixedInSectionSolve &&
        !connectionsToReroute.has(route.globalConnection.connectionId),
    )
    const fixedSectionSolvedRoutes = remainingSectionRoutes.map(
      (route) => route.sectionRoute,
    )

    const baselineSectionSolvedRoutes = [
      ...fixedSectionSolvedRoutes,
      ...this.activeSection.sectionRoutes
        .filter((route) =>
          connectionsToReroute.has(route.globalConnection.connectionId),
        )
        .map((route) => route.sectionRoute),
    ]
    this.baselineSectionCost = this.computeCostOfSection({
      section: this.activeSection,
      solvedRoutes: baselineSectionSolvedRoutes,
    })
    this.baselineGlobalCost = this.computeSolvedGraphCost(this.solvedRoutes)

    this.activeSubSolver = this.createHyperGraphSolverFn({
      inputGraph: this.activeSection.graph,
      inputConnections: this.activeSection.connections,
      inputSolvedRoutes: fixedSectionSolvedRoutes,
    })

    // Validate the subsolver's connections have valid regions
    for (const conn of this.activeSubSolver.connections) {
      if (!conn.startRegion || !conn.endRegion) {
        console.error({
          startRegion: conn.startRegion?.regionId,
          endRegion: conn.endRegion?.regionId,
        })
      }
    }
  }

  override _step() {
    if (!this.activeSubSolver) {
      this.beginSectionSolve()
      return
    }

    this.activeSubSolver.step()

    if (!this.activeSection) {
      return
    }

    if (this.activeSubSolver.failed) {
      this.failedSubSolvers ??= []
      this.failedSubSolvers.push(this.activeSubSolver)
      const attempts =
        this.regionAttemptCounts.get(this.activeSection.centralRegionId) ?? 0
      this.regionAttemptCounts.set(
        this.activeSection.centralRegionId,
        attempts + 1,
      )
      this.activeSubSolver = null
      this.activeSection = null
      this.baselineSectionCost = Infinity
      this.baselineGlobalCost = Infinity
      return
    }

    if (!this.activeSubSolver.solved) return

    const candidateSectionSolvedRoutes = this.activeSubSolver.solvedRoutes
    const candidateCost = this.computeCostOfSection({
      section: this.activeSection,
      solvedRoutes: candidateSectionSolvedRoutes,
    })
    const replacementAppliedSolvedRoutes = previewSectionReplacement({
      solvedRoutes: this.solvedRoutes,
      section: this.activeSection,
      replacementSolvedRoutes: candidateSectionSolvedRoutes,
    })

    const candidateGlobalCost = this.computeSolvedGraphCost(
      replacementAppliedSolvedRoutes,
    )

    const sectionNotWorse = candidateCost <= this.baselineSectionCost
    const globalImproved = candidateGlobalCost < this.baselineGlobalCost
    const hasCustomSectionCost =
      Boolean(this.input.computeCostOfSection) ||
      this.computeCostOfSection !==
        HyperGraphSectionOptimizer.prototype.computeCostOfSection
    const improved =
      hasCustomSectionCost && !this.input.computeSolvedGraphCost
        ? candidateCost < this.baselineSectionCost
        : sectionNotWorse && globalImproved

    if (improved) {
      this.solvedRoutes = replacementAppliedSolvedRoutes

      const sourceSolver = this.hyperGraphSolver
      if (!sourceSolver) return

      sourceSolver.solvedRoutes = commitSolvedRoutes({
        graph: sourceSolver.graph,
        connections: sourceSolver.connections,
        solvedRoutes: this.solvedRoutes,
      })

      for (const regionId of this.activeSection.sectionRegionIds) {
        this.regionAttemptCounts.set(regionId, 0)
      }
      this.baselineSectionCost = candidateCost
      this.baselineGlobalCost = candidateGlobalCost
    } else {
      const attempts =
        this.regionAttemptCounts.get(this.activeSection.centralRegionId) ?? 0
      this.regionAttemptCounts.set(
        this.activeSection.centralRegionId,
        attempts + 1,
      )
    }

    this.activeSubSolver = null
    this.activeSection = null
    this.baselineSectionCost = Infinity
    this.baselineGlobalCost = Infinity
  }
}
