import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"
import { convertConnectionsToSerializedConnections } from "../convertConnectionsToSerializedConnections"
import { convertHyperGraphToSerializedHyperGraph } from "../convertHyperGraphToSerializedHyperGraph"
import type { HyperGraphSolver } from "../HyperGraphSolver"
import { createSeededRandom } from "../JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"
import {
  rebuildAssignmentsFromSolvedRoutes,
  rehydrateSolvedRoutes,
} from "../solvedRoutes"
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
import { previewSectionReplacement } from "./routes/previewSectionReplacement"
import { getSectionOfHyperGraphAsHyperGraph } from "./sections/getSectionOfHyperGraphAsHyperGraph"
import { seededShuffle } from "./seededShuffle"

export type CreateHyperGraphSolverInput = {
  inputGraph: HyperGraph | SerializedHyperGraph
  inputConnections: (Connection | SerializedConnection)[]
  inputSolvedRoutes: SolvedRoute[]
}

export type CreateHyperGraphSolver = (
  input: CreateHyperGraphSolverInput,
) => HyperGraphSolver<Region, RegionPort>

export type HyperGraphSectionRouteDescriptor = {
  originalRoute: SolvedRoute
  originalConnection: Connection
  localConnection: Connection
  localSolvedRoute: SolvedRoute
  canSeedLocalSolvedRoute: boolean
  startIndex: number
  endIndex: number
}

export type HyperGraphSection = {
  centralRegionId: RegionId
  sectionRegionIds: Set<RegionId>
  graph: HyperGraph
  connections: Connection[]
  routeDescriptors: HyperGraphSectionRouteDescriptor[]
}

export class HyperGraphSectionOptimizer extends BaseSolver {
  graph: HyperGraph
  connections: Connection[]
  solvedRoutes: SolvedRoute[]
  activeSection: HyperGraphSection | null = null
  baselineSectionCost = Infinity
  baselineBoardCost = Infinity
  regionAttemptCounts = new Map<RegionId, number>()
  sectionAttempts = 0
  maxAttemptsPerRegion: number
  maxSectionAttempts: number
  effort: number
  fractionToReplace: number
  alwaysRipConflicts: boolean

  declare activeSubSolver: HyperGraphSolver<Region, RegionPort> | null

  constructor(
    public input: {
      sourceSolver: HyperGraphSolver<Region, RegionPort>
      inputSolvedRoutes: SolvedRoute[]
      expansionHopsFromCentralRegion: number
      createHyperGraphSolver: CreateHyperGraphSolver
      maxAttemptsPerRegion: number
      computeRegionCost: (region: Region) => number
      regionScore: (region: Region) => number
      effort?: number
      maxSectionAttempts?: number
      fractionToReplace?: number
      alwaysRipConflicts?: boolean
      boardScore?: (solvedRoutes: SolvedRoute[]) => number
    },
  ) {
    super()
    this.graph = input.sourceSolver.graph

    const initialSolvedRoutes = input.inputSolvedRoutes
    const inputConnections = input.sourceSolver.connections

    this.connections = inputConnections
    this.solvedRoutes = rehydrateSolvedRoutes({
      graph: this.graph,
      connections: this.connections,
      solvedRoutes: initialSolvedRoutes,
    })
    rebuildAssignmentsFromSolvedRoutes(this.graph, this.solvedRoutes)
    this.maxAttemptsPerRegion = input.maxAttemptsPerRegion
    this.maxSectionAttempts = input.maxSectionAttempts ?? 500
    this.effort = input.effort ?? 1
    this.fractionToReplace = input.fractionToReplace ?? 0.2
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
      effort: this.effort,
      fractionToReplace: this.fractionToReplace,
      alwaysRipConflicts: this.alwaysRipConflicts,
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

  getCostOfCentralRegion(region: Region): number {
    const attempts = this.regionAttemptCounts.get(region.regionId) ?? 0
    return this.input.regionScore(region) + attempts * 10_000
  }

  computeCostOfSection({
    section,
    solvedRoutes,
  }: {
    section: HyperGraphSection
    solvedRoutes: SolvedRoute[]
  }): number {
    if (this.input.boardScore) {
      return this.input.boardScore(solvedRoutes)
    }
    // Default: sum of all region scores in the section
    const solver = this.input.createHyperGraphSolver({
      inputGraph: section.graph,
      inputConnections: section.connections,
      inputSolvedRoutes: solvedRoutes,
    })
    let totalCost = 0
    for (const region of solver.graph.regions) {
      totalCost += this.input.regionScore(region)
    }
    return totalCost
  }

  private computeBoardCost(solvedRoutes: SolvedRoute[]): number {
    if (this.input.boardScore) {
      return this.input.boardScore(solvedRoutes)
    }
    // Default: sum of all region scores
    const solver = this.input.createHyperGraphSolver({
      inputGraph: this.graph,
      inputConnections: this.connections,
      inputSolvedRoutes: solvedRoutes,
    })
    let totalCost = 0
    for (const region of solver.graph.regions) {
      totalCost += this.input.regionScore(region)
    }
    return totalCost
  }

  determineConnectionsToRip(
    section: HyperGraphSection,
    evaluationSolver: HyperGraphSolver<Region, RegionPort>,
  ): Set<string> {
    const allConnectionIds = section.routeDescriptors.map(
      (descriptor) => descriptor.originalConnection.connectionId,
    )
    if (this.fractionToReplace >= 1) {
      return new Set(allConnectionIds)
    }

    const attempts = this.regionAttemptCounts.get(section.centralRegionId) ?? 0
    const shuffledConnectionIds = seededShuffle(
      allConnectionIds,
      (attempts + 1) * 31337,
    )
    const ripCount = Math.max(
      1,
      Math.ceil(shuffledConnectionIds.length * this.fractionToReplace),
    )
    const connectionsToRip = new Set(shuffledConnectionIds.slice(0, ripCount))

    if (!this.alwaysRipConflicts) {
      return connectionsToRip
    }

    const localRegionMap = new Map(
      section.graph.regions.map((region) => [region.regionId, region]),
    )

    for (const descriptor of section.routeDescriptors) {
      for (const candidate of descriptor.localSolvedRoute.path) {
        if (!candidate.lastPort || !candidate.lastRegion) continue
        const sectionRegion = localRegionMap.get(candidate.lastRegion.regionId)
        if (!sectionRegion) continue

        evaluationSolver.currentConnection = descriptor.originalConnection
        const conflictingAssignments =
          evaluationSolver.getRipsRequiredForPortUsage(
            sectionRegion,
            candidate.lastPort,
            candidate.port,
          )

        for (const conflict of conflictingAssignments) {
          const firstId = descriptor.originalConnection.connectionId
          const secondId = conflict.connection.connectionId
          if (connectionsToRip.has(firstId) || connectionsToRip.has(secondId)) {
            continue
          }
          const random = createSeededRandom(
            (attempts + 1) * 31337 + firstId.length + secondId.length,
          )
          connectionsToRip.add(random() < 0.5 ? firstId : secondId)
        }
      }
    }

    return connectionsToRip
  }

  private getNextCentralRegion(): Region | null {
    const evaluationSolver = this.input.createHyperGraphSolver({
      inputGraph: this.graph,
      inputConnections: this.connections,
      inputSolvedRoutes: this.solvedRoutes ?? [],
    })
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

    const seedableRouteDescriptors = this.activeSection.routeDescriptors.filter(
      (descriptor) => descriptor.canSeedLocalSolvedRoute,
    )
    const baselineSolver = this.input.createHyperGraphSolver({
      inputGraph: this.activeSection.graph,
      inputConnections: this.activeSection.connections,
      inputSolvedRoutes: seedableRouteDescriptors.map(
        (descriptor) => descriptor.localSolvedRoute,
      ),
    })
    const connectionsToRip = this.determineConnectionsToRip(
      this.activeSection,
      baselineSolver,
    )
    for (const descriptor of this.activeSection.routeDescriptors) {
      if (!descriptor.canSeedLocalSolvedRoute) {
        connectionsToRip.add(descriptor.originalConnection.connectionId)
      }
    }
    const connectionsToKeep = this.activeSection.routeDescriptors.filter(
      (descriptor) =>
        descriptor.canSeedLocalSolvedRoute &&
        !connectionsToRip.has(descriptor.originalConnection.connectionId),
    )
    const keptLocalSolvedRoutes = connectionsToKeep.map(
      (descriptor) => descriptor.localSolvedRoute,
    )

    const baselineSectionSolvedRoutes = [
      ...keptLocalSolvedRoutes,
      ...this.activeSection.routeDescriptors
        .filter((descriptor) =>
          connectionsToRip.has(descriptor.originalConnection.connectionId),
        )
        .map((descriptor) => descriptor.localSolvedRoute),
    ]
    this.baselineSectionCost = this.computeCostOfSection({
      section: this.activeSection,
      solvedRoutes: baselineSectionSolvedRoutes,
    })
    this.baselineBoardCost = this.computeBoardCost(this.solvedRoutes)

    this.activeSubSolver = this.input.createHyperGraphSolver({
      inputGraph: this.activeSection.graph,
      inputConnections: this.activeSection.connections,
      inputSolvedRoutes: keptLocalSolvedRoutes,
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
      this.baselineBoardCost = Infinity
      return
    }

    if (!this.activeSubSolver.solved) return

    const replacementSolvedRoutes = this.activeSubSolver.solvedRoutes
    const candidateCost = this.computeCostOfSection({
      section: this.activeSection,
      solvedRoutes: replacementSolvedRoutes,
    })
    const replacementAppliedSolvedRoutes = previewSectionReplacement({
      solvedRoutes: this.solvedRoutes,
      section: this.activeSection,
      replacementSolvedRoutes,
    })

    const candidateBoardCost = this.computeBoardCost(
      replacementAppliedSolvedRoutes,
    )

    const sectionNotWorse = candidateCost <= this.baselineSectionCost
    const boardImproved = candidateBoardCost < this.baselineBoardCost

    if (sectionNotWorse && boardImproved) {
      this.solvedRoutes = replacementAppliedSolvedRoutes

      const sourceSolver = this.input.sourceSolver
      if (!sourceSolver) return

      sourceSolver.solvedRoutes = rehydrateSolvedRoutes({
        graph: sourceSolver.graph,
        connections: sourceSolver.connections,
        solvedRoutes: this.solvedRoutes,
      })
      rebuildAssignmentsFromSolvedRoutes(
        sourceSolver.graph,
        sourceSolver.solvedRoutes,
      )

      for (const regionId of this.activeSection.sectionRegionIds) {
        this.regionAttemptCounts.set(regionId, 0)
      }
      this.baselineSectionCost = candidateCost
      this.baselineBoardCost = candidateBoardCost
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
    this.baselineBoardCost = Infinity
  }
}
