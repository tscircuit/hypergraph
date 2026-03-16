import type {
  Candidate,
  Connection,
  HyperGraph,
  Region,
  RegionPort,
  RegionPortAssignment,
  SolvedRoute,
} from "./types"

type HyperGraphWithSolvedRoutes = HyperGraph & {
  solvedRoutes?: SolvedRoute[]
}

const getSharedRegions = (
  portA: RegionPort,
  portB: RegionPort,
  regionMap: Map<string, Region>,
): Region[] => {
  const portARegionIds = new Set([
    portA.region1.regionId,
    portA.region2.regionId,
  ])
  const shared: Region[] = []
  if (portARegionIds.has(portB.region1.regionId)) {
    const region = regionMap.get(portB.region1.regionId)
    if (region) shared.push(region)
  }
  if (portARegionIds.has(portB.region2.regionId)) {
    const region = regionMap.get(portB.region2.regionId)
    if (region && !shared.some((r) => r.regionId === region.regionId)) {
      shared.push(region)
    }
  }
  return shared
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

    for (let index = 0; index < solvedRoute.path.length; index++) {
      const originalCandidate = solvedRoute.path[index]
      const mappedPort = portMap.get(originalCandidate.port.portId)
      if (!mappedPort) {
        throw new Error(`Missing port ${originalCandidate.port.portId}`)
      }

      const candidate: Candidate = {
        port: mappedPort,
        g: originalCandidate.g,
        h: originalCandidate.h,
        f: originalCandidate.f,
        hops: originalCandidate.hops,
        ripRequired: originalCandidate.ripRequired,
      }

      if (originalCandidate.lastPort) {
        candidate.lastPort = portMap.get(originalCandidate.lastPort.portId)
        if (!candidate.lastPort) {
          throw new Error(
            `Missing lastPort ${originalCandidate.lastPort.portId}`,
          )
        }
      }
      if (originalCandidate.lastRegion) {
        candidate.lastRegion = regionMap.get(
          originalCandidate.lastRegion.regionId,
        )
        if (!candidate.lastRegion) {
          throw new Error(
            `Missing lastRegion ${originalCandidate.lastRegion.regionId}`,
          )
        }
      }
      if (originalCandidate.nextRegion) {
        candidate.nextRegion = regionMap.get(
          originalCandidate.nextRegion.regionId,
        )
        if (!candidate.nextRegion) {
          throw new Error(
            `Missing nextRegion ${originalCandidate.nextRegion.regionId}`,
          )
        }
      }
      const parent = path[path.length - 1]
      if (parent) candidate.parent = parent
      path.push(candidate)
    }

    for (let index = 0; index < path.length; index++) {
      const candidate = path[index]
      const previousCandidate = index > 0 ? path[index - 1] : undefined
      const nextCandidate =
        index < path.length - 1 ? path[index + 1] : undefined

      candidate.parent = previousCandidate

      if (previousCandidate) {
        const sharedLastRegions = getSharedRegions(
          previousCandidate.port,
          candidate.port,
          regionMap,
        )
        if (sharedLastRegions.length === 0) {
          throw new Error(`Non-adjacent transition at index ${index}`)
        }
        if (!candidate.lastPort || !candidate.lastRegion) {
          throw new Error(`Missing lastPort/lastRegion at index ${index}`)
        }
      }

      if (nextCandidate) {
        const sharedNextRegions = getSharedRegions(
          candidate.port,
          nextCandidate.port,
          regionMap,
        )
        if (sharedNextRegions.length === 0) {
          throw new Error(`Non-adjacent transition at index ${index}`)
        }
        if (!candidate.nextRegion) {
          throw new Error(`Missing nextRegion at index ${index}`)
        }
      }
    }

    const mappedConnection = connectionMap.get(
      solvedRoute.connection.connectionId,
    )
    if (!mappedConnection) {
      throw new Error(
        `Missing connection ${solvedRoute.connection.connectionId}`,
      )
    }

    return {
      path,
      connection: mappedConnection,
      requiredRip: solvedRoute.requiredRip,
    }
  })

  clearAssignmentsFromGraph(graph)
  ;(graph as HyperGraphWithSolvedRoutes).solvedRoutes = committedSolvedRoutes

  for (const solvedRoute of committedSolvedRoutes) {
    for (let index = 0; index < solvedRoute.path.length; index++) {
      const candidate = solvedRoute.path[index]
      candidate.port.assignment = {
        solvedRoute,
        connection: solvedRoute.connection,
      }

      if (index === 0) continue
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
