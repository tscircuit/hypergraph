import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import type {
  Connection,
  HyperGraph,
  Region,
  RegionId,
  RegionPort,
  SerializedConnection,
  SerializedHyperGraph,
  SolvedRoute,
} from "lib/types"
import { convertConnectionsToSerializedConnections } from "../convertConnectionsToSerializedConnections"
import { convertHyperGraphToSerializedHyperGraph } from "../convertHyperGraphToSerializedHyperGraph"
import type { HyperGraphSolver } from "../HyperGraphSolver"
import { createSeededRandom } from "../JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"
import { commitSolvedRoutes } from "../solvedRoutes"
import { countAssignmentsInSolvedRoutes } from "./helpers/countAssignmentsInSolvedRoutes"
import { mergeSectionRoutesIntoGlobal } from "./routes/mergeSectionRoutesIntoGlobal"
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

export class HyperGraphSectionOptimizer extends BaseSolver {
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
  fractionToReplace: number
  alwaysRipConflicts: boolean
  random: () => number = createSeededRandom(31337)

  declare activeSubSolver: HyperGraphSolver<Region, RegionPort> | null

  constructor(
    public input: {
      hyperGraphSolver: HyperGraphSolver<Region, RegionPort>
      inputSolvedRoutes: SolvedRoute[]
      expansionHopsFromCentralRegion: number
      createHyperGraphSolver: CreateHyperGraphSolver
      regionCost: (region: Region) => number
      effort: number
      ACCEPTABLE_REGION_COST: number
      MAX_ATTEMPTS_PER_REGION: number
      MAX_ATTEMPTS_PER_SECTION?: number
      FRACTION_TO_REPLACE?: number
      alwaysRipConflicts?: boolean
      computeSolvedGraphCost?: (solvedRoutes: SolvedRoute[]) => number
    },
  ) {
    super()
    this.graph = input.hyperGraphSolver.graph

    const initialSolvedRoutes = input.inputSolvedRoutes
    const inputConnections = input.hyperGraphSolver.connections

    this.connections = inputConnections
    this.solvedRoutes = commitSolvedRoutes({
      graph: this.graph,
      connections: this.connections,
      solvedRoutes: initialSolvedRoutes,
    })
    this.maxAttemptsPerRegion = input.MAX_ATTEMPTS_PER_REGION
    this.maxSectionAttempts = input.MAX_ATTEMPTS_PER_SECTION ?? 500
    this.iterations += this.iterations * (input.effort ?? 1)
    this.fractionToReplace = input.FRACTION_TO_REPLACE ?? 0.2
    this.alwaysRipConflicts = input.alwaysRipConflicts ?? true
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
      effort: this.input.effort,
      fractionToReplace: this.fractionToReplace,
      alwaysRipConflicts: this.alwaysRipConflicts,
      ACCEPTABLE_COST: this.input.ACCEPTABLE_REGION_COST,
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

  getCostOfRegionWithAttempts(region: Region): number {
    const attempts = this.regionAttemptCounts.get(region.regionId) ?? 0
    return this.input.regionCost(region) + attempts * 10_000
  }

  computeCostOfSection({
    section,
    solvedRoutes,
  }: {
    section: HyperGraphSection
    solvedRoutes: SolvedRoute[]
  }): number {
    if (this.input.computeSolvedGraphCost) {
      return this.input.computeSolvedGraphCost(solvedRoutes)
    }
    // Default: sum of all region scores in the section
    const solver = this.input.createHyperGraphSolver({
      inputGraph: section.graph,
      inputConnections: section.connections,
      inputSolvedRoutes: solvedRoutes,
    })
    let totalCost = 0
    for (const region of solver.graph.regions) {
      totalCost += this.input.regionCost(region)
    }
    return totalCost
  }

  private computeSolvedGraphCost(solvedRoutes: SolvedRoute[]): number {
    if (this.input.computeSolvedGraphCost) {
      return this.input.computeSolvedGraphCost(solvedRoutes)
    }
    // Default: sum of all region scores
    const solver = this.input.createHyperGraphSolver({
      inputGraph: this.graph,
      inputConnections: this.connections,
      inputSolvedRoutes: solvedRoutes,
    })
    let totalCost = 0
    for (const region of solver.graph.regions) {
      totalCost += this.input.regionCost(region)
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

      const regionCost = this.input.regionCost(region)

      // Skip regions below acceptable threshold
      if (regionCost < this.input.ACCEPTABLE_REGION_COST) continue

      const cost = this.getCostOfRegionWithAttempts(region)
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
    const baselineSolver = this.input.createHyperGraphSolver({
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

    const baselineSectionSolvedRoutes = [...fixedSectionSolvedRoutes]
    this.baselineSectionCost = this.computeCostOfSection({
      section: this.activeSection,
      solvedRoutes: baselineSectionSolvedRoutes,
    })
    this.baselineGlobalCost = this.computeSolvedGraphCost(this.solvedRoutes)

    this.activeSubSolver = this.input.createHyperGraphSolver({
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
    const replacementAppliedSolvedRoutes = mergeSectionRoutesIntoGlobal({
      solvedRoutes: this.solvedRoutes,
      section: this.activeSection,
      replacementSolvedRoutes: candidateSectionSolvedRoutes,
      globalGraph: this.graph,
    })

    const candidateGlobalCost = this.computeSolvedGraphCost(
      replacementAppliedSolvedRoutes,
    )

    const baselineAssignments = countAssignmentsInSolvedRoutes(
      this.solvedRoutes,
    )
    const candidateAssignments = countAssignmentsInSolvedRoutes(
      replacementAppliedSolvedRoutes,
    )

    const sectionNotWorse = candidateCost <= this.baselineSectionCost
    const globalImproved = candidateGlobalCost < this.baselineGlobalCost
    const preservesNonEmptyAssignments =
      baselineAssignments === 0 || candidateAssignments > 0

    if (sectionNotWorse && globalImproved && preservesNonEmptyAssignments) {
      this.solvedRoutes = replacementAppliedSolvedRoutes

      const sourceSolver = this.input.hyperGraphSolver
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
