import { HyperGraphSolver } from "./HyperGraphSolver"
import type {
  Candidate,
  Connection,
  HyperGraph,
  Region,
  RegionPort,
  RegionPortAssignment,
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
   * A crossing route is only ripped when the increased region cost of the
   * crossing is strictly greater than this threshold. Defaults to 0, which
   * rips every crossing that has a positive cost.
   */
  ripCostThreshold?: number
}

/**
 * A HyperGraphSolver that only rips crossing routes whose crossing cost is
 * above `ripCostThreshold`. Cheap crossings are left in place so the new route
 * coexists with them. Routes that reuse a port of a different network are
 * always ripped because two networks can never share a port.
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
    super({ ...input, rippingEnabled: input.rippingEnabled ?? true })
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
   * Decide whether the existing `assignment` must be ripped because a new
   * route crosses it in `region` using `port1` and `port2`. `cost` is the
   * increased region cost of that crossing. By default a crossing is ripped
   * when its cost is strictly above `ripCostThreshold`.
   */
  shouldRipCrossing(
    _region: RegionType,
    _port1: RegionPortType,
    _port2: RegionPortType,
    _assignment: RegionPortAssignment,
    cost: number,
  ): boolean {
    return cost > this.ripCostThreshold
  }

  override computeCrossingRoutes(
    newlySolvedRoute: SolvedRoute,
  ): Set<SolvedRoute> {
    const crossingRoutesToRip = new Set<SolvedRoute>()
    for (const candidate of newlySolvedRoute.path) {
      if (!candidate.lastPort || !candidate.lastRegion) continue
      const region = candidate.lastRegion as RegionType
      const port1 = candidate.lastPort as RegionPortType
      const port2 = candidate.port as RegionPortType
      const ripsRequired = this.getRipsRequiredForPortUsage(
        region,
        port1,
        port2,
      )
      if (ripsRequired.length === 0) continue
      const cost = this.computeIncreasedRegionCostIfPortsAreUsed(
        region,
        port1,
        port2,
      )
      for (const assignment of ripsRequired) {
        if (this.shouldRipCrossing(region, port1, port2, assignment, cost)) {
          crossingRoutesToRip.add(assignment.solvedRoute)
        }
      }
    }
    return crossingRoutesToRip
  }
}
