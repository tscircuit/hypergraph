import { attachSerializedGraphMetadata } from "./serializedGraphMetadata"
import type {
  RegionId,
  SerializedConnection,
  SerializedGraphPort,
  SerializedGraphRegion,
  SerializedHyperGraph,
  SerializedSolvedRoute,
} from "./types"

export const extractSectionOfHyperGraph = (input: {
  graph: SerializedHyperGraph
  centralRegionId: RegionId
  expansionHopsFromCentralRegion: number
}): SerializedHyperGraph => {
  const graph = attachSerializedGraphMetadata(input.graph)
  const centralRegion = graph._regionMap?.get(input.centralRegionId)

  if (!centralRegion) {
    throw new Error(
      `Central region ${input.centralRegionId} not found in hypergraph`,
    )
  }

  if (!input.graph.solvedRoutes) {
    throw new Error(
      "extractSectionOfHyperGraph requires graph.solvedRoutes to be present",
    )
  }
  const sectionRegionIds = getSerializedSectionRegionIds({
    graph,
    centralRegionId: centralRegion.regionId,
    expansionHopsFromCentralRegion: input.expansionHopsFromCentralRegion,
  })
  const sectionRegions = new Map<RegionId, SerializedGraphRegion>()
  const boundaryRegionMap = new Map<string, SerializedGraphRegion>()
  const sectionPorts: SerializedGraphPort[] = []

  for (const regionId of sectionRegionIds) {
    const region = graph._regionMap?.get(regionId)
    if (!region) continue
    sectionRegions.set(regionId, {
      regionId: region.regionId,
      pointIds: [],
      d: region.d,
    })
  }

  for (const port of graph.ports) {
    const region1InSection = sectionRegionIds.has(port.region1Id)
    const region2InSection = sectionRegionIds.has(port.region2Id)
    if (!region1InSection && !region2InSection) continue

    if (region1InSection && region2InSection) {
      sectionPorts.push({
        portId: port.portId,
        region1Id: port.region1Id,
        region2Id: port.region2Id,
        d: port.d,
        _deadendInSection: port._deadendInSection,
      })
      sectionRegions.get(port.region1Id)?.pointIds.push(port.portId)
      sectionRegions.get(port.region2Id)?.pointIds.push(port.portId)
      continue
    }

    const insideRegionId = region1InSection ? port.region1Id : port.region2Id
    const boundaryRegion = getOrCreateSerializedBoundaryRegion(
      port,
      boundaryRegionMap,
    )
    sectionPorts.push({
      portId: port.portId,
      region1Id: insideRegionId,
      region2Id: boundaryRegion.regionId,
      d: port.d,
      _deadendInSection: port._deadendInSection,
    })
    sectionRegions.get(insideRegionId)?.pointIds.push(port.portId)
    boundaryRegion.pointIds.push(port.portId)
  }

  const sectionGraph: SerializedHyperGraph = attachSerializedGraphMetadata({
    ports: sectionPorts,
    regions: [...sectionRegions.values(), ...boundaryRegionMap.values()],
  })
  const localPortIdSet = new Set(sectionGraph.ports.map((port) => port.portId))
  const sectionConnections: SerializedConnection[] = []
  const sectionSolvedRoutes: SerializedSolvedRoute[] = []
  const sectionRouteBindings: NonNullable<
    SerializedHyperGraph["_sectionRouteBindings"]
  > = []

  for (const solvedRoute of input.graph.solvedRoutes) {
    const routePathSegment = getSerializedRouteSectionSpan(
      solvedRoute,
      sectionRegionIds,
    )
    if (!routePathSegment) continue

    const startCandidate = solvedRoute.path[routePathSegment.startIndex]
    const endCandidate = solvedRoute.path[routePathSegment.endIndex]
    if (!startCandidate || !endCandidate) continue

    const startRegionId = sectionRegionIds.has(
      solvedRoute.connection.startRegionId,
    )
      ? solvedRoute.connection.startRegionId
      : ensureBoundaryRegionInSectionGraph(
          sectionGraph,
          getOrCreateSerializedBoundaryRegion(
            getRequiredSerializedPort(graph, startCandidate.portId),
            boundaryRegionMap,
          ),
        ).regionId
    const endRegionId = sectionRegionIds.has(solvedRoute.connection.endRegionId)
      ? solvedRoute.connection.endRegionId
      : ensureBoundaryRegionInSectionGraph(
          sectionGraph,
          getOrCreateSerializedBoundaryRegion(
            getRequiredSerializedPort(graph, endCandidate.portId),
            boundaryRegionMap,
          ),
        ).regionId
    const sectionConnection: SerializedConnection = {
      connectionId: solvedRoute.connection.connectionId,
      mutuallyConnectedNetworkId:
        solvedRoute.connection.mutuallyConnectedNetworkId,
      startRegionId,
      endRegionId,
    }

    sectionConnections.push(sectionConnection)
    sectionRouteBindings.push({
      connectionId: solvedRoute.connection.connectionId,
      solvedPathStartIndex: routePathSegment.startIndex,
      solvedPathEndIndex: routePathSegment.endIndex,
    })
    sectionSolvedRoutes.push(
      createSerializedSectionSolvedRoute({
        graph: sectionGraph,
        globalRoute: solvedRoute,
        sectionConnection,
        sectionStartIndex: routePathSegment.startIndex,
        sectionEndIndex: routePathSegment.endIndex,
        localPortIdSet,
      }),
    )
  }

  return attachSerializedGraphMetadata({
    ...sectionGraph,
    connections: sectionConnections,
    solvedRoutes: sectionSolvedRoutes,
    _sectionCentralRegionId: input.centralRegionId,
    _sectionRouteBindings: sectionRouteBindings,
  })
}

const getSerializedSectionRegionIds = (input: {
  graph: SerializedHyperGraph
  centralRegionId: RegionId
  expansionHopsFromCentralRegion: number
}): Set<RegionId> => {
  const { graph, centralRegionId, expansionHopsFromCentralRegion } = input
  const sectionRegionIds = new Set<RegionId>([centralRegionId])
  const queue: Array<{ regionId: RegionId; hops: number }> = [
    { regionId: centralRegionId, hops: 0 },
  ]

  while (queue.length > 0) {
    const { regionId, hops } = queue.shift()!
    if (hops >= expansionHopsFromCentralRegion + 1) continue

    for (const nextRegionId of graph._adjacentRegionIdsByRegionId?.get(
      regionId,
    ) ?? []) {
      if (sectionRegionIds.has(nextRegionId)) continue
      sectionRegionIds.add(nextRegionId)
      queue.push({ regionId: nextRegionId, hops: hops + 1 })
    }
  }

  return sectionRegionIds
}

const getSerializedRouteSectionSpan = (
  route: SerializedSolvedRoute,
  sectionRegionIds: Set<RegionId>,
): { startIndex: number; endIndex: number } | null => {
  let startIndex = -1
  let endIndex = -1

  for (let i = 0; i < route.path.length; i++) {
    const candidate = route.path[i]
    const touchesSection =
      (candidate.lastRegionId &&
        sectionRegionIds.has(candidate.lastRegionId)) ||
      (candidate.nextRegionId && sectionRegionIds.has(candidate.nextRegionId))

    if (!touchesSection) continue
    if (startIndex === -1) startIndex = i
    endIndex = i
  }

  if (startIndex === -1) return null
  return { startIndex, endIndex }
}

const getOrCreateSerializedBoundaryRegion = (
  port: SerializedGraphPort,
  boundaryRegionMap: Map<string, SerializedGraphRegion>,
): SerializedGraphRegion => {
  let boundaryRegion = boundaryRegionMap.get(port.portId)
  if (!boundaryRegion) {
    const x = typeof port.d?.x === "number" ? port.d.x : 0
    const y = typeof port.d?.y === "number" ? port.d.y : 0
    boundaryRegion = {
      regionId: `__section_boundary__${port.portId}`,
      pointIds: [],
      d: {
        isBoundaryRegion: true,
        boundaryPortId: port.portId,
        ...port.d,
        center: { x, y },
        bounds: {
          minX: x - 0.05,
          maxX: x + 0.05,
          minY: y - 0.05,
          maxY: y + 0.05,
        },
      },
    }
    boundaryRegionMap.set(port.portId, boundaryRegion)
  }
  return boundaryRegion
}

const getRequiredSerializedPort = (
  graph: SerializedHyperGraph,
  portId: string,
): SerializedGraphPort => {
  const port = graph._portMap?.get(portId)
  if (!port) {
    throw new Error(`Port ${portId} not found while extracting section`)
  }
  return port
}

const ensureBoundaryRegionInSectionGraph = (
  sectionGraph: SerializedHyperGraph,
  boundaryRegion: SerializedGraphRegion,
): SerializedGraphRegion => {
  if (sectionGraph._regionMap?.has(boundaryRegion.regionId)) {
    return boundaryRegion
  }

  sectionGraph.regions.push(boundaryRegion)
  sectionGraph._regionMap?.set(boundaryRegion.regionId, boundaryRegion)
  sectionGraph._portsByRegionId?.set(boundaryRegion.regionId, [])
  sectionGraph._adjacentRegionIdsByRegionId?.set(
    boundaryRegion.regionId,
    new Set(),
  )
  return boundaryRegion
}

const createSerializedSectionSolvedRoute = (input: {
  graph: SerializedHyperGraph
  globalRoute: SerializedSolvedRoute
  sectionConnection: SerializedConnection
  sectionStartIndex: number
  sectionEndIndex: number
  localPortIdSet: Set<string>
}): SerializedSolvedRoute => {
  const {
    graph,
    globalRoute,
    sectionConnection,
    sectionStartIndex,
    sectionEndIndex,
    localPortIdSet,
  } = input
  const originalLocalPath = globalRoute.path
    .slice(sectionStartIndex, sectionEndIndex + 1)
    .filter((candidate) => localPortIdSet.has(candidate.portId))

  const path: SerializedSolvedRoute["path"] = []
  let currentRegionId = sectionConnection.startRegionId

  for (let index = 0; index < originalLocalPath.length; index++) {
    const originalCandidate = originalLocalPath[index]!
    const port = getRequiredSerializedPort(graph, originalCandidate.portId)
    const nextRegionId =
      port.region1Id === currentRegionId ? port.region2Id : port.region1Id

    path.push({
      portId: port.portId,
      g: 0,
      h: 0,
      f: 0,
      hops: index,
      ripRequired: originalCandidate.ripRequired,
      lastPortId: index > 0 ? path[index - 1]?.portId : undefined,
      lastRegionId: index > 0 ? currentRegionId : undefined,
      nextRegionId,
    })

    currentRegionId = nextRegionId
  }

  return {
    connection: sectionConnection,
    path,
    requiredRip: globalRoute.requiredRip,
  }
}
