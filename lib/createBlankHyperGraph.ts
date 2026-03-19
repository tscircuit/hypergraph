import { attachSerializedGraphMetadata } from "./serializedGraphMetadata"
import type {
  SerializedHyperGraph,
  SerializedConnection,
  SerializedGraphPort,
  SerializedGraphRegion,
  SerializedSolvedRoute,
} from "./types"

export const createBlankHyperGraph = (
  inputGraph: SerializedHyperGraph,
): SerializedHyperGraph => {
  const graph = attachSerializedGraphMetadata(inputGraph)
  if (!inputGraph.solvedRoutes) {
    throw new Error(
      "createBlankHyperGraph requires graph.solvedRoutes to be present",
    )
  }
  const removableLeafRegionIds = getRemovableLeafRegionIds(graph)
  const replacedEndpointRegionIds = getReplacedEndpointRegionIds(
    inputGraph.solvedRoutes,
    graph,
  )
  const blankGraph = cloneSerializedGraphExcludingRegions(
    graph,
    removableLeafRegionIds,
  )
  const blankGraphWithMetadata = attachSerializedGraphMetadata(blankGraph)
  const connections: SerializedConnection[] = []

  for (const solvedRoute of inputGraph.solvedRoutes) {
    const startRegionId = getBlankConnectionEndpointRegionId({
      solvedRoute,
      blankGraph: blankGraphWithMetadata,
      sourceGraph: graph,
      replacedEndpointRegionIds,
      endpoint: "start",
    })
    const endRegionId = getBlankConnectionEndpointRegionId({
      solvedRoute,
      blankGraph: blankGraphWithMetadata,
      sourceGraph: graph,
      replacedEndpointRegionIds,
      endpoint: "end",
    })

    connections.push({
      connectionId: solvedRoute.connection.connectionId,
      mutuallyConnectedNetworkId:
        solvedRoute.connection.mutuallyConnectedNetworkId,
      startRegionId,
      endRegionId,
    })
  }

  return attachSerializedGraphMetadata({
    ...blankGraphWithMetadata,
    _sectionCentralRegionId: inputGraph._sectionCentralRegionId,
    _sectionRouteBindings: inputGraph._sectionRouteBindings
      ? structuredClone(inputGraph._sectionRouteBindings)
      : undefined,
    connections,
  })
}

const getRemovableLeafRegionIds = (
  graph: SerializedHyperGraph,
): Set<string> => {
  return new Set(
    graph.regions
      .filter(
        (region) =>
          (graph._portsByRegionId?.get(region.regionId)?.length ?? 0) === 1,
      )
      .map((region) => region.regionId),
  )
}

const getReplacedEndpointRegionIds = (
  solvedRoutes: SerializedSolvedRoute[],
  graph: SerializedHyperGraph,
): Set<string> => {
  const replacedEndpointRegionIds = new Set<string>()

  for (const solvedRoute of solvedRoutes) {
    const startCandidate = solvedRoute.path[0]
    if (
      startCandidate &&
      shouldReplaceEndpointRegion(
        solvedRoute.connection.startRegionId,
        startCandidate,
        graph,
      )
    ) {
      replacedEndpointRegionIds.add(solvedRoute.connection.startRegionId)
    }

    const endCandidate = solvedRoute.path[solvedRoute.path.length - 1]
    if (
      endCandidate &&
      shouldReplaceEndpointRegion(
        solvedRoute.connection.endRegionId,
        endCandidate,
        graph,
      )
    ) {
      replacedEndpointRegionIds.add(solvedRoute.connection.endRegionId)
    }
  }

  return replacedEndpointRegionIds
}

const shouldReplaceEndpointRegion = (
  endpointRegionId: string,
  endpointCandidate: SerializedSolvedRoute["path"][number],
  graph: SerializedHyperGraph,
): boolean => {
  const endpointRegion = graph._regionMap?.get(endpointRegionId)
  return (
    (endpointRegion?.pointIds.length ?? 0) === 1 &&
    endpointRegion?.pointIds[0] === endpointCandidate.portId
  )
}

const cloneSerializedGraphExcludingRegions = (
  graph: SerializedHyperGraph,
  excludedRegionIds: Set<string>,
): SerializedHyperGraph => {
  const clonedRegionMap = new Map<string, SerializedGraphRegion>()
  const clonedPorts: SerializedGraphPort[] = []

  for (const region of graph.regions) {
    if (excludedRegionIds.has(region.regionId)) continue
    clonedRegionMap.set(region.regionId, {
      regionId: region.regionId,
      pointIds: [],
      d: region.d,
    })
  }

  for (const port of graph.ports) {
    if (
      excludedRegionIds.has(port.region1Id) ||
      excludedRegionIds.has(port.region2Id)
    ) {
      continue
    }

    const clonedPort: SerializedGraphPort = {
      portId: port.portId,
      region1Id: port.region1Id,
      region2Id: port.region2Id,
      d: port.d,
    }
    clonedRegionMap.get(port.region1Id)?.pointIds.push(clonedPort.portId)
    clonedRegionMap.get(port.region2Id)?.pointIds.push(clonedPort.portId)
    clonedPorts.push(clonedPort)
  }

  return attachSerializedGraphMetadata({
    regions: Array.from(clonedRegionMap.values()),
    ports: clonedPorts,
  })
}

const getBlankConnectionEndpointRegionId = (input: {
  solvedRoute: SerializedSolvedRoute
  blankGraph: SerializedHyperGraph
  sourceGraph: SerializedHyperGraph
  replacedEndpointRegionIds: Set<string>
  endpoint: "start" | "end"
}): string => {
  const {
    solvedRoute,
    blankGraph,
    sourceGraph,
    replacedEndpointRegionIds,
    endpoint,
  } = input
  const originalRegion =
    endpoint === "start"
      ? solvedRoute.connection.startRegionId
      : solvedRoute.connection.endRegionId

  if (blankGraph._regionMap?.has(originalRegion)) return originalRegion

  if (!replacedEndpointRegionIds.has(originalRegion)) {
    throw new Error(
      `Connection endpoint region ${originalRegion} is missing from blank graph`,
    )
  }

  const endpointCandidate =
    endpoint === "start"
      ? solvedRoute.path[0]
      : solvedRoute.path[solvedRoute.path.length - 1]
  if (!endpointCandidate) {
    throw new Error(
      `Solved route ${solvedRoute.connection.connectionId} has no path candidates`,
    )
  }

  const attachedRegionId = getAttachedRegionId({
    port: getRequiredSerializedPort(sourceGraph, endpointCandidate.portId),
    blankGraph,
    originalRegionId: originalRegion,
    preferredRegionId:
      endpoint === "start"
        ? endpointCandidate.nextRegionId
        : endpointCandidate.lastRegionId,
  })
  if (!attachedRegionId) {
    throw new Error(
      `Could not determine ${endpoint} region for connection ${solvedRoute.connection.connectionId}`,
    )
  }

  if (!blankGraph._regionMap?.has(attachedRegionId)) {
    throw new Error(
      `Region ${attachedRegionId} not found in blank graph for connection ${solvedRoute.connection.connectionId}`,
    )
  }

  const connectionRegionId = `connection:${solvedRoute.connection.connectionId}:${endpoint}`
  const originalRegionData = sourceGraph._regionMap?.get(originalRegion)
  const endpointPort = getRequiredSerializedPort(
    sourceGraph,
    endpointCandidate.portId,
  )
  const connectionRegion: SerializedGraphRegion = {
    regionId: connectionRegionId,
    pointIds: [],
    d: originalRegionData?.d,
  }
  blankGraph.regions.push(connectionRegion)
  blankGraph._regionMap?.set(connectionRegion.regionId, connectionRegion)
  blankGraph._portsByRegionId?.set(connectionRegion.regionId, [])
  blankGraph._adjacentRegionIdsByRegionId?.set(
    connectionRegion.regionId,
    new Set(),
  )

  const connectionPortId = `connection:${solvedRoute.connection.connectionId}:${endpoint}-port`
  const connectionPort: SerializedGraphPort = {
    portId: connectionPortId,
    region1Id: connectionRegionId,
    region2Id: attachedRegionId,
    d: endpointPort.d,
  }
  connectionRegion.pointIds.push(connectionPort.portId)
  blankGraph._regionMap
    ?.get(attachedRegionId)
    ?.pointIds.push(connectionPort.portId)
  blankGraph.ports.push(connectionPort)
  blankGraph._portMap?.set(connectionPort.portId, connectionPort)
  blankGraph._portsByRegionId?.get(connectionRegionId)?.push(connectionPort)
  blankGraph._portsByRegionId?.get(attachedRegionId)?.push(connectionPort)
  blankGraph._adjacentRegionIdsByRegionId
    ?.get(connectionRegionId)
    ?.add(attachedRegionId)
  blankGraph._adjacentRegionIdsByRegionId
    ?.get(attachedRegionId)
    ?.add(connectionRegionId)

  return connectionRegionId
}

const getAttachedRegionId = (input: {
  port: SerializedGraphPort
  blankGraph: SerializedHyperGraph
  originalRegionId: string
  preferredRegionId?: string
}): string | undefined => {
  const { port, blankGraph, originalRegionId, preferredRegionId } = input
  const blankGraphRegionIds = blankGraph._regionMap

  if (
    preferredRegionId &&
    preferredRegionId !== originalRegionId &&
    blankGraphRegionIds?.has(preferredRegionId)
  ) {
    return preferredRegionId
  }

  if (
    port.region1Id !== originalRegionId &&
    blankGraphRegionIds?.has(port.region1Id)
  ) {
    return port.region1Id
  }
  if (
    port.region2Id !== originalRegionId &&
    blankGraphRegionIds?.has(port.region2Id)
  ) {
    return port.region2Id
  }
  return undefined
}

const getRequiredSerializedPort = (
  graph: SerializedHyperGraph,
  portId: string,
): SerializedGraphPort => {
  const port = graph._portMap?.get(portId)
  if (!port) {
    throw new Error(`Port ${portId} not found while creating blank graph`)
  }
  return port
}
