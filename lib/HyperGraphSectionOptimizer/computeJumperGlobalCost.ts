import type { HyperGraphSolver } from "lib/HyperGraphSolver"
import type { Region, RegionPort } from "lib/types"

// TODO: replace this in future
export const computeJumperRegionCost = (region: Region): number => {
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

// TODO: replace this in future
export const computeJumperGlobalCost = (
  solver: HyperGraphSolver<Region, RegionPort>,
): number => {
  let totalCost = 0

  for (const region of solver.graph.regions) {
    totalCost += computeJumperRegionCost(region)
  }

  return totalCost
}
