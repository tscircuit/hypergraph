// NOTE: add this file to the repo (lib/) and export it from your package entry if you want it available externally.

import { HyperGraphSolver } from "./HyperGraphSolver"
import type {
  Candidate,
  Connection,
  HyperGraph,
  Region,
  RegionPort,
  SerializedConnection,
  SerializedHyperGraph,
  SolvedRoute,
} from "./types"

export interface PartialRippingOptions {
  ripCostThreshold?: number
  maxRoutesToRip?: number
  ripStrategy?: "none" | "cheapest" | "all"
}

export interface HyperGraphPartialRippingInput<
  RegionType extends Region = Region,
  RegionPortType extends RegionPort = RegionPort,
> {
  inputGraph: HyperGraph | SerializedHyperGraph
  inputConnections: (Connection | SerializedConnection)[]
  greedyMultiplier?: number
  rippingEnabled?: boolean
  ripCost?: number
  ripCostThreshold?: number
  maxRoutesToRip?: number
  ripStrategy?: "none" | "cheapest" | "all"
}

export class HyperGraphPartialRipping<
  RegionType extends Region = Region,
  RegionPortType extends RegionPort = RegionPort,
  CandidateType extends Candidate<RegionType, RegionPortType> = Candidate<
    RegionType,
    RegionPortType
  >,
> extends HyperGraphSolver<RegionType, RegionPortType, CandidateType> {
  override getSolverName(): string {
    return "HyperGraphPartialRipping"
  }

  ripCostThreshold: number = Infinity
  maxRoutesToRip: number = Infinity
  ripStrategy: "none" | "cheapest" | "all" = "all"

  totalRipsPerformed: number = 0
  ripsSkippedDueToThreshold: number = 0

  constructor(input: HyperGraphPartialRippingInput<RegionType, RegionPortType>) {
    super({
      inputGraph: input.inputGraph,
      inputConnections: input.inputConnections,
      greedyMultiplier: input.greedyMultiplier,
      rippingEnabled: input.rippingEnabled ?? true,
      ripCost: input.ripCost,
    })

    if (input.ripCostThreshold !== undefined) {
      this.ripCostThreshold = input.ripCostThreshold
    }
    if (input.maxRoutesToRip !== undefined) {
      this.maxRoutesToRip = input.maxRoutesToRip
    }
    if (input.ripStrategy !== undefined) {
      this.ripStrategy = input.ripStrategy
    }
  }

  override getConstructorParams() {
    return {
      ...super.getConstructorParams(),
      ripCostThreshold: this.ripCostThreshold,
      maxRoutesToRip: this.maxRoutesToRip,
      ripStrategy: this.ripStrategy,
    }
  }

  calculateRipCost(route: SolvedRoute): number {
    // Default: ripCost * number of ports in the route
    return this.ripCost * route.path.length
  }

  calculateTotalRipCost(routes: Set<SolvedRoute>): number {
    let totalCost = 0
    for (const route of routes) {
      totalCost += this.calculateRipCost(route)
    }
    return totalCost
  }

  shouldRipRoutes(
    candidateRoutes: Set<SolvedRoute>,
    _currentSolvedRoute?: SolvedRoute,
  ): Set<SolvedRoute> {
    if (candidateRoutes.size === 0) {
      return candidateRoutes
    }

    if (this.ripStrategy === "all") {
      return this.applyMaxRoutesLimit(candidateRoutes)
    }

    const totalCost = this.calculateTotalRipCost(candidateRoutes)

    if (totalCost <= this.ripCostThreshold) {
      return this.applyMaxRoutesLimit(candidateRoutes)
    }

    if (this.ripStrategy === "none") {
      this.ripsSkippedDueToThreshold += candidateRoutes.size
      return new Set()
    }

    if (this.ripStrategy === "cheapest") {
      return this.selectCheapestRoutes(candidateRoutes)
    }

    return this.applyMaxRoutesLimit(candidateRoutes)
  }

  private selectCheapestRoutes(routes: Set<SolvedRoute>): Set<SolvedRoute> {
    const routesWithCost = Array.from(routes).map((route) => ({
      route,
      cost: this.calculateRipCost(route),
    }))

    routesWithCost.sort((a, b) => a.cost - b.cost)

    const selectedRoutes = new Set<SolvedRoute>()
    let accumulatedCost = 0

    for (const { route, cost } of routesWithCost) {
      if (
        accumulatedCost + cost <= this.ripCostThreshold &&
        selectedRoutes.size < this.maxRoutesToRip
      ) {
        selectedRoutes.add(route)
        accumulatedCost += cost
      } else {
        this.ripsSkippedDueToThreshold++
      }
    }

    return selectedRoutes
  }

  private applyMaxRoutesLimit(routes: Set<SolvedRoute>): Set<SolvedRoute> {
    if (routes.size <= this.maxRoutesToRip) return routes

    const routesWithCost = Array.from(routes).map((route) => ({
      route,
      cost: this.calculateRipCost(route),
    }))
    routesWithCost.sort((a, b) => a.cost - b.cost)

    const selectedRoutes = new Set<SolvedRoute>()
    for (let i = 0; i < this.maxRoutesToRip && i < routesWithCost.length; i++) {
      selectedRoutes.add(routesWithCost[i].route)
    }

    this.ripsSkippedDueToThreshold += routes.size - selectedRoutes.size
    return selectedRoutes
  }

  override ripSolvedRoute(solvedRoute: SolvedRoute) {
    this.totalRipsPerformed++
    super.ripSolvedRoute(solvedRoute)
  }

  getRipDiagnostics() {
    return {
      totalRipsPerformed: this.totalRipsPerformed,
      ripsSkippedDueToThreshold: this.ripsSkippedDueToThreshold,
      ripCostThreshold: this.ripCostThreshold,
      maxRoutesToRip: this.maxRoutesToRip,
      ripStrategy: this.ripStrategy,
    }
  }

  /**
   * IMPORTANT: override processSolvedRoute so we can use shouldRipRoutes()
   * This is mostly a copy of HyperGraphSolver.processSolvedRoute with the
   * ripping loop replaced by a call to this.shouldRipRoutes.
   */
  override processSolvedRoute(finalCandidate: CandidateType) {
    // Build the solvedRoute as in the base impl
    const solvedRoute: SolvedRoute = {
      path: [],
      connection: this.currentConnection!,
      requiredRip: false,
    }

    let cursorCandidate: CandidateType | undefined = finalCandidate
    let anyRipsRequired = false
    while (cursorCandidate) {
      anyRipsRequired ||= !!cursorCandidate.ripRequired
      solvedRoute.path.unshift(cursorCandidate)
      cursorCandidate = cursorCandidate.parent as CandidateType | undefined
    }

    // Determine routes that would be ripped by the normal algorithm
    const routesToRip: Set<SolvedRoute> = new Set()
    if (anyRipsRequired) {
      solvedRoute.requiredRip = true
      for (const candidate of solvedRoute.path) {
        if (
          candidate.port.assignment &&
          candidate.port.assignment.connection.mutuallyConnectedNetworkId !==
            this.currentConnection!.mutuallyConnectedNetworkId
        ) {
          routesToRip.add(candidate.port.assignment.solvedRoute)
        }
      }
    }

    for (const candidate of solvedRoute.path) {
      if (!candidate.lastPort || !candidate.lastRegion) continue
      const ripsRequired = this.getRipsRequiredForPortUsage(
        candidate.lastRegion as RegionType,
        candidate.lastPort as RegionPortType,
        candidate.port as RegionPortType,
      )
      for (const assignment of ripsRequired) {
        routesToRip.add(assignment.solvedRoute)
      }
    }

    // NEW: pick routes to actually rip based on policy
    const chosenRoutesToRip = this.shouldRipRoutes(routesToRip, solvedRoute)

    if (chosenRoutesToRip.size > 0) {
      solvedRoute.requiredRip = true
      for (const route of chosenRoutesToRip) {
        this.ripSolvedRoute(route)
      }
    } else {
      // If we skipped ripping entirely, keep requiredRip=false (or leave as set above)
      // No further action needed here
    }

    // Finally assign ports / region assignments for the solvedRoute
    for (const candidate of solvedRoute.path) {
      candidate.port.assignment = {
        solvedRoute,
        connection: this.currentConnection!,
      }
      if (!candidate.lastPort) continue
      const regionPortAssignment = {
        regionPort1: candidate.lastPort,
        regionPort2: candidate.port,
        region: candidate.lastRegion!,
        connection: this.currentConnection!,
        solvedRoute,
      } as any
      candidate.lastRegion!.assignments?.push(regionPortAssignment)
    }

    this.solvedRoutes.push(solvedRoute)
    this.routeSolvedHook(solvedRoute)
  }
}

export function createPartialRippingSolver(
  input: HyperGraphPartialRippingInput & {
    preset?: "conservative" | "moderate" | "aggressive"
  },
) {
  const presets: Record<string, Partial<PartialRippingOptions>> = {
    conservative: {
      ripCostThreshold: 50,
      maxRoutesToRip: 2,
      ripStrategy: "cheapest",
    },
    moderate: {
      ripCostThreshold: 150,
      maxRoutesToRip: 5,
      ripStrategy: "cheapest",
    },
    aggressive: {
      ripCostThreshold: Infinity,
      maxRoutesToRip: Infinity,
      ripStrategy: "all",
    },
  }

  const preset: Partial<PartialRippingOptions> = input.preset
    ? presets[input.preset]
    : {}

  return new HyperGraphPartialRipping({
    ...input,
    ...preset,
    ripCostThreshold: input.ripCostThreshold ?? preset.ripCostThreshold,
    maxRoutesToRip: input.maxRoutesToRip ?? preset.maxRoutesToRip,
    ripStrategy: input.ripStrategy ?? preset.ripStrategy,
  })
}