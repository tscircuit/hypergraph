import { HyperGraphSolver } from "./HyperGraphSolver"
import type {
  Connection,
  HyperGraph,
  SerializedConnection,
  SerializedHyperGraph,
} from "./types"

/**
 * HyperGraphPartialRipping extends HyperGraphSolver with a preset configuration
 * for partial ripping. This solver only rips when the estimated rip cost is below
 * a threshold, preventing unnecessary cascading rips.
 *
 * This is useful in scenarios where:
 * - You want conservative ripping to avoid expensive route recalculations
 * - Conflicts should only be resolved if the cost is justified
 * - You prefer to reject solutions requiring expensive rips and retry with different paths
 */
export class HyperGraphPartialRipping extends HyperGraphSolver {
  override getSolverName(): string {
    return "HyperGraphPartialRipping"
  }

  constructor(input: {
    inputGraph: HyperGraph | SerializedHyperGraph
    inputConnections: (Connection | SerializedConnection)[]
    /**
     * Multiplier applied to ripCost to determine the rip threshold.
     * Default: 1.5
     * A rip will only be performed if its estimated cost < (ripCost * this multiplier)
     */
    ripThresholdMultiplier?: number
    /**
     * Maximum total cost allowed for all rips in a single route.
     * Default: 200
     * If cumulative rip cost would exceed this, the route is rejected.
     */
    maxCumulativeRipCost?: number
    /**
     * Base cost per rip operation.
     * Default: 35.39 (from JumperGraphSolver defaults)
     */
    ripCost?: number
    /**
     * Greedy multiplier for heuristic weighting.
     * Default: 0.55
     */
    greedyMultiplier?: number
  }) {
    super({
      inputGraph: input.inputGraph,
      inputConnections: input.inputConnections,
      greedyMultiplier: input.greedyMultiplier ?? 0.55,
      rippingEnabled: true,
      ripCost: input.ripCost ?? 35.39,
      partialRippingEnabled: true,
      ripThresholdMultiplier: input.ripThresholdMultiplier ?? 1.5,
      maxCumulativeRipCost: input.maxCumulativeRipCost ?? 200,
    })
  }
}
