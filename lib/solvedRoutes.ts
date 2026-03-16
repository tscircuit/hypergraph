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

const failCommit = (message: string): never => {
  throw new Error(`[commitSolvedRoutes] ${message}`)
}

const expectDefined = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) failCommit(message)
  return value as T
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
      const mappedPort = expectDefined(
        portMap.get(originalCandidate.port.portId),
        `Missing port ${originalCandidate.port.portId} while mapping connection ${solvedRoute.connection.connectionId} at index ${index}`,
      )

      const candidate: Candidate = {
        port: mappedPort,
        g: originalCandidate.g,
        h: originalCandidate.h,
        f: originalCandidate.f,
        hops: originalCandidate.hops,
        ripRequired: originalCandidate.ripRequired,
      }

      if (originalCandidate.lastPort) {
        const mappedLastPort = expectDefined(
          portMap.get(originalCandidate.lastPort.portId),
          `Missing lastPort ${originalCandidate.lastPort.portId} while mapping connection ${solvedRoute.connection.connectionId} at index ${index}`,
        )
        candidate.lastPort = mappedLastPort
      }
      if (originalCandidate.lastRegion) {
        const mappedLastRegion = expectDefined(
          regionMap.get(originalCandidate.lastRegion.regionId),
          `Missing lastRegion ${originalCandidate.lastRegion.regionId} while mapping connection ${solvedRoute.connection.connectionId} at index ${index}`,
        )
        candidate.lastRegion = mappedLastRegion
      }
      if (originalCandidate.nextRegion) {
        const mappedNextRegion = expectDefined(
          regionMap.get(originalCandidate.nextRegion.regionId),
          `Missing nextRegion ${originalCandidate.nextRegion.regionId} while mapping connection ${solvedRoute.connection.connectionId} at index ${index}`,
        )
        candidate.nextRegion = mappedNextRegion
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

      if (!previousCandidate) {
        if (candidate.lastPort || candidate.lastRegion) {
          failCommit(
            `First candidate must not have lastPort/lastRegion for connection ${solvedRoute.connection.connectionId}`,
          )
        }
      } else {
        const sharedLastRegions = getSharedRegions(
          previousCandidate.port,
          candidate.port,
          regionMap,
        )
        if (sharedLastRegions.length === 0) {
          failCommit(
            `Non-adjacent transition for connection ${solvedRoute.connection.connectionId} at index ${index}: ${previousCandidate.port.portId} -> ${candidate.port.portId}`,
          )
        }
        const sharedLastRegionIds = new Set(
          sharedLastRegions.map((region) => region.regionId),
        )
        expectDefined(
          sharedLastRegions[0],
          `Non-adjacent transition for connection ${solvedRoute.connection.connectionId} at index ${index}: ${previousCandidate.port.portId} -> ${candidate.port.portId}`,
        )
        if (!candidate.lastPort) {
          failCommit(
            `Missing lastPort for connection ${solvedRoute.connection.connectionId} at index ${index}`,
          )
        }
        const lastPort = expectDefined(
          candidate.lastPort,
          `Missing lastPort for connection ${solvedRoute.connection.connectionId} at index ${index}`,
        )
        if (lastPort.portId !== previousCandidate.port.portId) {
          failCommit(
            `lastPort mismatch for connection ${solvedRoute.connection.connectionId} at index ${index}: expected ${previousCandidate.port.portId}, got ${lastPort.portId}`,
          )
        }
        if (!candidate.lastRegion) {
          failCommit(
            `Missing lastRegion for connection ${solvedRoute.connection.connectionId} at index ${index}`,
          )
        }
        const lastRegion = expectDefined(
          candidate.lastRegion,
          `Missing lastRegion for connection ${solvedRoute.connection.connectionId} at index ${index}`,
        )
        if (!sharedLastRegionIds.has(lastRegion.regionId)) {
          failCommit(
            `lastRegion mismatch for connection ${solvedRoute.connection.connectionId} at index ${index}: expected one of [${Array.from(sharedLastRegionIds).join(", ")}], got ${lastRegion.regionId}`,
          )
        }
      }

      if (!nextCandidate) {
        if (
          candidate.nextRegion &&
          candidate.nextRegion.regionId !==
            solvedRoute.connection.endRegion.regionId
        ) {
          failCommit(
            `Last candidate has unexpected nextRegion for connection ${solvedRoute.connection.connectionId}: expected endRegion ${solvedRoute.connection.endRegion.regionId}, got ${candidate.nextRegion.regionId}`,
          )
        }
      } else {
        const sharedNextRegions = getSharedRegions(
          candidate.port,
          nextCandidate.port,
          regionMap,
        )
        if (sharedNextRegions.length === 0) {
          failCommit(
            `Cannot infer nextRegion for connection ${solvedRoute.connection.connectionId} at index ${index}: ${candidate.port.portId} -> ${nextCandidate.port.portId}`,
          )
        }
        const sharedNextRegionIds = new Set(
          sharedNextRegions.map((region) => region.regionId),
        )
        expectDefined(
          sharedNextRegions[0],
          `Cannot infer nextRegion for connection ${solvedRoute.connection.connectionId} at index ${index}: ${candidate.port.portId} -> ${nextCandidate.port.portId}`,
        )
        if (!candidate.nextRegion) {
          failCommit(
            `Missing nextRegion for connection ${solvedRoute.connection.connectionId} at index ${index}`,
          )
        }
        const nextRegion = expectDefined(
          candidate.nextRegion,
          `Missing nextRegion for connection ${solvedRoute.connection.connectionId} at index ${index}`,
        )
        if (!sharedNextRegionIds.has(nextRegion.regionId)) {
          failCommit(
            `nextRegion mismatch for connection ${solvedRoute.connection.connectionId} at index ${index}: expected one of [${Array.from(sharedNextRegionIds).join(", ")}], got ${nextRegion.regionId}`,
          )
        }
      }
    }

    const mappedConnection = expectDefined(
      connectionMap.get(solvedRoute.connection.connectionId),
      `Missing connection ${solvedRoute.connection.connectionId} while mapping routes`,
    )

    return {
      path,
      connection: mappedConnection,
      requiredRip: solvedRoute.requiredRip,
    }
  })

  clearAssignmentsFromGraph(graph)
  ;(graph as HyperGraphWithSolvedRoutes).solvedRoutes = committedSolvedRoutes

  let assignmentsAdded = 0

  for (const solvedRoute of committedSolvedRoutes) {
    for (let index = 0; index < solvedRoute.path.length; index++) {
      const candidate = solvedRoute.path[index]
      candidate.port.assignment = {
        solvedRoute,
        connection: solvedRoute.connection,
      }

      if (index === 0) continue

      if (!candidate.lastPort || !candidate.lastRegion) {
        failCommit(
          `Unexpected missing lastPort/lastRegion after validation for connection ${solvedRoute.connection.connectionId} at index ${index}`,
        )
      }

      const lastPort = expectDefined(
        candidate.lastPort,
        `Unexpected missing lastPort after validation for connection ${solvedRoute.connection.connectionId} at index ${index}`,
      )
      const lastRegion = expectDefined(
        candidate.lastRegion,
        `Unexpected missing lastRegion after validation for connection ${solvedRoute.connection.connectionId} at index ${index}`,
      )

      const regionPortAssignment: RegionPortAssignment = {
        regionPort1: lastPort,
        regionPort2: candidate.port,
        region: lastRegion,
        connection: solvedRoute.connection,
        solvedRoute,
      }

      lastRegion.assignments ??= []
      lastRegion.assignments.push(regionPortAssignment)
      assignmentsAdded++
    }
  }

  console.log(`[commitSolvedRoutes] Added ${assignmentsAdded} assignments`)

  return committedSolvedRoutes
}
