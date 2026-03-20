import { commitSolvedRoutes } from "../solvedRoutes"
import type { Connection, SolvedRoute } from "../types"
import { computeCrossingAssignments } from "./computeCrossingAssignments"
import type { JumperGraph } from "./jumper-types"

export const countCommittedRouteIntersections = (
  graph: JumperGraph,
): number => {
  let intersectionCount = 0

  for (const region of graph.regions) {
    const assignments = region.assignments ?? []
    for (let i = 0; i < assignments.length; i++) {
      const assignment = assignments[i]!
      const crossingAssignments = computeCrossingAssignments(
        region,
        assignment.regionPort1 as any,
        assignment.regionPort2 as any,
      )

      for (let j = i + 1; j < assignments.length; j++) {
        const otherAssignment = assignments[j]!
        if (
          assignment.connection.mutuallyConnectedNetworkId ===
          otherAssignment.connection.mutuallyConnectedNetworkId
        ) {
          continue
        }
        if (crossingAssignments.includes(otherAssignment)) {
          intersectionCount += 1
        }
      }
    }
  }

  return intersectionCount
}

export const computeCommittedIntersectionPenaltyCost = (
  graph: JumperGraph,
  intersectionPenalty: number,
): number => countCommittedRouteIntersections(graph) * intersectionPenalty

export const computeIntersectionPenaltyCostForSolvedRoutes = (input: {
  graph: JumperGraph
  connections: Connection[]
  solvedRoutes: SolvedRoute[]
  intersectionPenalty: number
}): number => {
  commitSolvedRoutes(input)
  return computeCommittedIntersectionPenaltyCost(
    input.graph,
    input.intersectionPenalty,
  )
}
