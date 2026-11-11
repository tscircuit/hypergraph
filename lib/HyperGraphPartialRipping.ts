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

export type HyperGraphPartialRippingInput = {
  inputGraph: HyperGraph | SerializedHyperGraph
  inputConnections: (Connection | SerializedConnection)[]
  greedyMultiplier?: number
  rippingEnabled?: boolean
  ripCost?: number
  inputSolvedRoutes?: SolvedRoute[]
  /**
   * Crossing routes are only ripped when the cost of using a port pair in a
   * region (computeIncreasedRegionCostIfPortsAreUsed) is strictly above this
   * threshold. Routes that only cross at or below the threshold are kept.
   * Routes that share a port with the new route are always ripped.
   */
  ripCostThreshold?: number
}

/**
 * A HyperGraphSolver that only rips conflicting crossing routes when the
 * region cost caused by the crossing is above `ripCostThreshold`.
 */
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

  ripCostThreshold = 0

  constructor(input: HyperGraphPartialRippingInput) {
    super(input)
    if (input.ripCostThreshold !== undefined) {
      this.ripCostThreshold = input.ripCostThreshold
    }
  }

  override getConstructorParams() {
    return {
      ...super.getConstructorParams(),
      ripCostThreshold: this.ripCostThreshold,
    }
  }

  /**
   * OPTIONALLY OVERRIDE THIS
   *
   * Return true if the crossing at (region, port1, port2) with the given cost
   * should cause conflicting routes to be ripped.
   */
  shouldRipCrossing(
    _region: RegionType,
    _port1: RegionPortType,
    _port2: RegionPortType,
    cost: number,
  ): boolean {
    return cost > this.ripCostThreshold
  }

  override computeCrossingRoutes(
    newlySolvedRoute: SolvedRoute,
  ): Set<SolvedRoute> {
    const crossingRoutesToRip: Set<SolvedRoute> = new Set()
    for (const candidate of newlySolvedRoute.path) {
      if (!candidate.lastPort || !candidate.lastRegion) continue
      const region = candidate.lastRegion as RegionType
      const port1 = candidate.lastPort as RegionPortType
      const port2 = candidate.port as RegionPortType
      const cost = this.computeIncreasedRegionCostIfPortsAreUsed(
        region,
        port1,
        port2,
      )
      if (!this.shouldRipCrossing(region, port1, port2, cost)) continue
      for (const assignment of this.getRipsRequiredForPortUsage(
        region,
        port1,
        port2,
      )) {
        crossingRoutesToRip.add(assignment.solvedRoute)
      }
    }
    return crossingRoutesToRip
  }
}

export { HyperGraphPartialRipping as HyperGraphPartialRippingSolver }
