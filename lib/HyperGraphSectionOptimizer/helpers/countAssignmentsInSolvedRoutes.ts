import type { SolvedRoute } from "lib/types"

/**
 * Counts the total number of region-port assignments across all solved routes.
 * Each assignment represents a port-to-port transition through a region.
 */
export const countAssignmentsInSolvedRoutes = (
  solvedRoutes: SolvedRoute[],
): number => {
  let assignmentCount = 0
  for (const solvedRoute of solvedRoutes) {
    for (const candidate of solvedRoute.path) {
      if (candidate.lastPort && candidate.lastRegion) {
        assignmentCount++
      }
    }
  }
  return assignmentCount
}
