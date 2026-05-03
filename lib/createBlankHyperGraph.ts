import { convertConnectionsToSerializedConnections } from "./convertConnectionsToSerializedConnections"
import { convertHyperGraphToSerializedHyperGraph } from "./convertHyperGraphToSerializedHyperGraph"
import { convertSerializedHyperGraphToHyperGraph } from "./convertSerializedHyperGraphToHyperGraph"
import { convertSerializedSolvedRoutesToSolvedRoutes } from "./convertSerializedSolvedRoutesToSolvedRoutes"
import type {
  Connection,
  HyperGraph,
  Region,
  RegionPort,
  SerializedHyperGraph,
  SolvedRoute,
} from "./types"

export const createBlankHyperGraph = (
  inputGraph: SerializedHyperGraph,
): SerializedHyperGraph => {
  const deserializedGraph = convertSerializedHyperGraphToHyperGraph(inputGraph)
  if (!inputGraph.solvedRoutes) {
    throw new Error(
      "createBlankHyperGraph requires graph.solvedRoutes to be present",
    )
  }

  const solvedRoutes = convertSerializedSolvedRoutesToSolvedRoutes(
    inputGraph.solvedRoutes,
    deserializedGraph,
  )

  const removableLeafRegionIds = getRemovableLeafRegionIds(deserializedGraph)
  const replacedEndpointRegionIds = getReplacedEndpointRegionIds(solvedRoutes)
  const blankGraph = cloneGraphExcludingRegions(
    deserializedGraph,
    removableLeafRegionIds,
  )
  const connections: Connection[] = []

  for (const solvedRoute of solvedRoutes) {
    const startEndpoint = getBlankConnectionEndpointRegion({
      solvedRoute,
      blankGraph,
      replacedEndpointRegionIds,
      endpoint: "start",
    })
    const endEndpoint = getBlankConnectionEndpointRegion({
      solvedRoute,
      blankGraph,
      replacedEndpointRegionIds,
      endpoint: "end",
    })

    connections.push({
      connectionId: solvedRoute.connection.connectionId,
      mutuallyConnectedNetworkId:
        solvedRoute.connection.mutuallyConnectedNetworkId,
      startRegion: startEndpoint.region,
      endRegion: endEndpoint.region,
      startPortId: startEndpoint.portId,
      endPortId: endEndpoint.portId,
    })
  }

  return {
    ...convertHyperGraphToSerializedHyperGraph(blankGraph),
    connections: convertConnectionsToSerializedConnections(connections),
    _sectionCentralRegionId: inputGraph._sectionCentralRegionId,
    _sectionRouteBindings: inputGraph._sectionRouteBindings
      ? structuredClone(inputGraph._sectionRouteBindings)
      : undefined,
  }
}

const getRemovableLeafRegionIds = (graph: HyperGraph): Set<string> => {
  return new Set(
    graph.regions
      .filter((region) => region.ports.length === 1)
      .map((region) => region.regionId),
  )
}

const getReplacedEndpointRegionIds = (
  solvedRoutes: SolvedRoute[],
): Set<string> => {
  const replacedEndpointRegionIds = new Set<string>()

  for (const solvedRoute of solvedRoutes) {
    const startCandidate = solvedRoute.path[0]
    if (
      startCandidate &&
      shouldReplaceEndpointRegion(
        solvedRoute.connection.startRegion,
        startCandidate,
      )
    ) {
      replacedEndpointRegionIds.add(solvedRoute.connection.startRegion.regionId)
    }

    const endCandidate = solvedRoute.path[solvedRoute.path.length - 1]
    if (
      endCandidate &&
      shouldReplaceEndpointRegion(
        solvedRoute.connection.endRegion,
        endCandidate,
      )
    ) {
      replacedEndpointRegionIds.add(solvedRoute.connection.endRegion.regionId)
    }
  }

  return replacedEndpointRegionIds
}

const shouldReplaceEndpointRegion = (
  endpointRegion: Region,
  endpointCandidate: SolvedRoute["path"][number],
): boolean => {
  return (
    endpointRegion.ports.length === 1 &&
    endpointRegion.ports[0]?.portId === endpointCandidate.port.portId
  )
}

const cloneGraphExcludingRegions = (
  graph: HyperGraph,
  excludedRegionIds: Set<string>,
): HyperGraph => {
  const clonedRegionMap = new Map<string, Region>()
  const clonedPorts: RegionPort[] = []

  for (const region of graph.regions) {
    if (excludedRegionIds.has(region.regionId)) continue
    clonedRegionMap.set(region.regionId, {
      regionId: region.regionId,
      ports: [],
      d: region.d ? structuredClone(region.d) : region.d,
      assignments: [],
    })
  }

  for (const port of graph.ports) {
    if (
      excludedRegionIds.has(port.region1.regionId) ||
      excludedRegionIds.has(port.region2.regionId)
    ) {
      continue
    }

    const clonedPort: RegionPort = {
      portId: port.portId,
      region1: clonedRegionMap.get(port.region1.regionId)!,
      region2: clonedRegionMap.get(port.region2.regionId)!,
      d: port.d ? structuredClone(port.d) : port.d,
    }
    clonedPort.region1.ports.push(clonedPort)
    clonedPort.region2.ports.push(clonedPort)
    clonedPorts.push(clonedPort)
  }

  return {
    regions: Array.from(clonedRegionMap.values()),
    ports: clonedPorts,
  }
}

const getBlankConnectionEndpointRegion = (input: {
  solvedRoute: SolvedRoute
  blankGraph: HyperGraph
  replacedEndpointRegionIds: Set<string>
  endpoint: "start" | "end"
}): { region: Region; portId?: string } => {
  const { solvedRoute, blankGraph, replacedEndpointRegionIds, endpoint } = input
  const originalRegion =
    endpoint === "start"
      ? solvedRoute.connection.startRegion
      : solvedRoute.connection.endRegion
  const originalPortId =
    endpoint === "start"
      ? solvedRoute.connection.startPortId
      : solvedRoute.connection.endPortId
  const fallbackPortId =
    endpoint === "start"
      ? solvedRoute.path[0]?.port.portId
      : solvedRoute.path[solvedRoute.path.length - 1]?.port.portId

  const existingRegion = blankGraph.regions.find(
    (region) => region.regionId === originalRegion.regionId,
  )
  if (existingRegion) {
    return { region: existingRegion, portId: originalPortId ?? fallbackPortId }
  }

  if (!replacedEndpointRegionIds.has(originalRegion.regionId)) {
    throw new Error(
      `Connection endpoint region ${originalRegion.regionId} is missing from blank graph`,
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
    port: endpointCandidate.port,
    originalRegionId: originalRegion.regionId,
    preferredRegionId:
      endpoint === "start"
        ? endpointCandidate.nextRegion?.regionId
        : endpointCandidate.lastRegion?.regionId,
  })
  if (!attachedRegionId) {
    throw new Error(
      `Could not determine ${endpoint} region for connection ${solvedRoute.connection.connectionId}`,
    )
  }

  const attachedRegion = blankGraph.regions.find(
    (region) => region.regionId === attachedRegionId,
  )
  if (!attachedRegion) {
    throw new Error(
      `Region ${attachedRegionId} not found in blank graph for connection ${solvedRoute.connection.connectionId}`,
    )
  }

  const connectionRegion: Region = {
    regionId: `connection:${solvedRoute.connection.connectionId}:${endpoint}`,
    ports: [],
    d: originalRegion.d ? structuredClone(originalRegion.d) : originalRegion.d,
    assignments: [],
  }
  blankGraph.regions.push(connectionRegion)

  const connectionPort: RegionPort = {
    portId: `connection:${solvedRoute.connection.connectionId}:${endpoint}-port`,
    region1: connectionRegion,
    region2: attachedRegion,
    d: endpointCandidate.port.d
      ? structuredClone(endpointCandidate.port.d)
      : endpointCandidate.port.d,
  }
  connectionRegion.ports.push(connectionPort)
  attachedRegion.ports.push(connectionPort)
  blankGraph.ports.push(connectionPort)

  return { region: connectionRegion, portId: connectionPort.portId }
}

const getAttachedRegionId = (input: {
  port: RegionPort
  originalRegionId: string
  preferredRegionId?: string
}): string | undefined => {
  const { port, originalRegionId, preferredRegionId } = input
  if (preferredRegionId && preferredRegionId !== originalRegionId) {
    return preferredRegionId
  }
  if (port.region1.regionId !== originalRegionId) return port.region1.regionId
  if (port.region2.regionId !== originalRegionId) return port.region2.regionId
  return undefined
}
