import type {
  Candidate,
  Connection,
  HyperGraph,
  RegionPortAssignment,
  SolvedRoute,
} from "./types"

type HyperGraphWithSolvedRoutes = HyperGraph & {
  solvedRoutes?: SolvedRoute[]
}

export const clearAssignmentsFromGraph = (graph: HyperGraph) => {
  for (const region of graph.regions) {
    region.assignments = []
  }
  for (const port of graph.ports) {
    port.assignment = undefined
  }
}

export const commitSolvedRoutes = ({
  graph,
  connections,
  solvedRoutes,
}: {
  graph: HyperGraph
  connections: Connection[]
  solvedRoutes: SolvedRoute[]
}): SolvedRoute[] => {
  const portMap = new Map(graph.ports.map((port) => [port.portId, port]))
  const regionMap = new Map(
    graph.regions.map((region) => [region.regionId, region]),
  )
  const connectionMap = new Map(
    connections.map((connection) => [connection.connectionId, connection]),
  )

  const committedSolvedRoutes = solvedRoutes.map((solvedRoute) => {
    const path: Candidate[] = []

    for (const originalCandidate of solvedRoute.path) {
      const candidate: Candidate = {
        port: portMap.get(originalCandidate.port.portId)!,
        g: originalCandidate.g,
        h: originalCandidate.h,
        f: originalCandidate.f,
        hops: originalCandidate.hops,
        ripRequired: originalCandidate.ripRequired,
      }

      if (originalCandidate.lastPort) {
        candidate.lastPort = portMap.get(originalCandidate.lastPort.portId)
      }
      if (originalCandidate.lastRegion) {
        candidate.lastRegion = regionMap.get(
          originalCandidate.lastRegion.regionId,
        )
      }
      if (originalCandidate.nextRegion) {
        candidate.nextRegion = regionMap.get(
          originalCandidate.nextRegion.regionId,
        )
      }
      const parent = path[path.length - 1]
      if (parent) candidate.parent = parent
      path.push(candidate)
    }

    return {
      path,
      connection: connectionMap.get(solvedRoute.connection.connectionId)!,
      requiredRip: solvedRoute.requiredRip,
    }
  })

  clearAssignmentsFromGraph(graph)
  ;(graph as HyperGraphWithSolvedRoutes).solvedRoutes = committedSolvedRoutes

  for (const solvedRoute of committedSolvedRoutes) {
    for (const candidate of solvedRoute.path) {
      candidate.port.assignment = {
        solvedRoute,
        connection: solvedRoute.connection,
      }

      if (!candidate.lastPort || !candidate.lastRegion) continue

      const regionPortAssignment: RegionPortAssignment = {
        regionPort1: candidate.lastPort,
        regionPort2: candidate.port,
        region: candidate.lastRegion,
        connection: solvedRoute.connection,
        solvedRoute,
      }

      candidate.lastRegion.assignments ??= []
      candidate.lastRegion.assignments.push(regionPortAssignment)
    }
  }

  return committedSolvedRoutes
}
