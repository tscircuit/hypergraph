import type { HyperGraphSolver } from "lib/HyperGraphSolver"
import type { Region, RegionPort } from "lib/types"

/**
 * Computes the cost contribution of a single region.
 * Used for prioritizing which regions to optimize first.
 */
export const computeRegionCost = (region: Region): number => {
  const assignments = region.assignments ?? []
  if (assignments.length === 0) return 0

  // For through-jumper regions: penalize each use
  if (region.d?.isThroughJumper) {
    const uniqueNetworks = new Set(
      assignments.map((a) => a.connection.mutuallyConnectedNetworkId),
    )
    return uniqueNetworks.size * 1.0
  }

  // For pad regions: penalize conflicts
  if (region.d?.isPad) {
    const uniqueNetworks = new Set(
      assignments.map((a) => a.connection.mutuallyConnectedNetworkId),
    )
    const padConflicts = uniqueNetworks.size > 1 ? uniqueNetworks.size - 1 : 0
    if (padConflicts > 0) {
      return padConflicts * 10.0
    }
  }

  return 0
}

/**
 * Computes the total cost of the board by counting jumper usage.
 * For jumper routing, crossings aren't possible (that's the point of jumpers).
 * Instead, we penalize:
 * 1. Using through-jumpers (jumper regions used in routing)
 * 2. Pad conflicts (multiple nets using same pad)
 *
 * Lower scores mean fewer jumpers used, which is better.
 */
export const computeBoardCost = (
  solver: HyperGraphSolver<Region, RegionPort>,
): number => {
  let totalCost = 0

  for (const region of solver.graph.regions) {
    totalCost += computeRegionCost(region)
  }

  return totalCost
}
