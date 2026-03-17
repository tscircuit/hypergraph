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

const CONNECTION_REGION_SIZE = 0.8

export const createBlankHyperGraphFromHyperGraphWithSolvedRoutes = (
  inputGraph: SerializedHyperGraph,
): SerializedHyperGraph => {
  const deserializedGraph = convertSerializedHyperGraphToHyperGraph(inputGraph)
  if (!inputGraph.solvedRoutes) {
    throw new Error(
      "createBlankHyperGraphFromHyperGraphWithSolvedRoutes requires graph.solvedRoutes to be present",
    )
  }
  const solvedRoutes = convertSerializedSolvedRoutesToSolvedRoutes(
    inputGraph.solvedRoutes,
    deserializedGraph,
  )

  const boundaryRegionIds = new Set(
    deserializedGraph.regions
      .filter((region) => isSyntheticBoundaryRegion(region))
      .map((region) => region.regionId),
  )

  const blankGraph = cloneGraphWithoutBoundaryRegions(
    deserializedGraph,
    boundaryRegionIds,
  )
  const connections: Connection[] = []

  for (const solvedRoute of solvedRoutes) {
    const startRegion = getBlankConnectionEndpointRegion({
      solvedRoute,
      blankGraph,
      boundaryRegionIds,
      endpoint: "start",
    })
    const endRegion = getBlankConnectionEndpointRegion({
      solvedRoute,
      blankGraph,
      boundaryRegionIds,
      endpoint: "end",
    })

    connections.push({
      connectionId: solvedRoute.connection.connectionId,
      mutuallyConnectedNetworkId:
        solvedRoute.connection.mutuallyConnectedNetworkId,
      startRegion,
      endRegion,
    })
  }

  return {
    ...convertHyperGraphToSerializedHyperGraph(blankGraph),
    connections: convertConnectionsToSerializedConnections(connections),
  }
}

const cloneGraphWithoutBoundaryRegions = (
  graph: HyperGraph,
  boundaryRegionIds: Set<string>,
): HyperGraph => {
  const clonedRegionMap = new Map<string, Region>()
  const clonedPorts: RegionPort[] = []

  for (const region of graph.regions) {
    if (boundaryRegionIds.has(region.regionId)) continue
    clonedRegionMap.set(region.regionId, {
      regionId: region.regionId,
      ports: [],
      d: region.d ? structuredClone(region.d) : region.d,
      assignments: [],
    })
  }

  for (const port of graph.ports) {
    if (
      boundaryRegionIds.has(port.region1.regionId) ||
      boundaryRegionIds.has(port.region2.regionId)
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
  boundaryRegionIds: Set<string>
  endpoint: "start" | "end"
}): Region => {
  const { solvedRoute, blankGraph, boundaryRegionIds, endpoint } = input
  const originalRegion =
    endpoint === "start"
      ? solvedRoute.connection.startRegion
      : solvedRoute.connection.endRegion

  const existingRegion = blankGraph.regions.find(
    (region) => region.regionId === originalRegion.regionId,
  )
  if (existingRegion) return existingRegion

  if (!isSyntheticBoundaryRegion(originalRegion)) {
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

  const insideRegionId =
    endpoint === "start"
      ? (endpointCandidate.nextRegion?.regionId ??
        getOtherNonBoundaryRegionId(endpointCandidate.port, boundaryRegionIds))
      : (endpointCandidate.lastRegion?.regionId ??
        getOtherNonBoundaryRegionId(endpointCandidate.port, boundaryRegionIds))

  if (!insideRegionId) {
    throw new Error(
      `Could not determine ${endpoint} region for connection ${solvedRoute.connection.connectionId}`,
    )
  }

  const insideRegion = blankGraph.regions.find(
    (region) => region.regionId === insideRegionId,
  )
  if (!insideRegion) {
    throw new Error(
      `Region ${insideRegionId} not found in blank graph for connection ${solvedRoute.connection.connectionId}`,
    )
  }

  const connectionRegion = createConnectionRegionAtBoundary({
    regionId: `conn:${solvedRoute.connection.connectionId}:${endpoint}`,
    insideRegion,
    port: endpointCandidate.port,
  })
  blankGraph.regions.push(connectionRegion)

  const connectionPort: RegionPort = {
    portId: `conn:${solvedRoute.connection.connectionId}:${endpoint}-port`,
    region1: connectionRegion,
    region2: insideRegion,
    d: endpointCandidate.port.d
      ? structuredClone(endpointCandidate.port.d)
      : endpointCandidate.port.d,
  }
  connectionRegion.ports.push(connectionPort)
  insideRegion.ports.push(connectionPort)
  blankGraph.ports.push(connectionPort)

  return connectionRegion
}

const createConnectionRegionAtBoundary = (input: {
  regionId: string
  insideRegion: Region
  port: RegionPort
}): Region => {
  const { regionId, insideRegion, port } = input
  const { x, y } = port.d ?? { x: 0, y: 0 }
  const side = getClosestBoundarySide(insideRegion.d.bounds, { x, y })
  const halfSize = CONNECTION_REGION_SIZE / 2

  let center = { x, y }
  if (side === "left") center = { x: insideRegion.d.bounds.minX - halfSize, y }
  if (side === "right") center = { x: insideRegion.d.bounds.maxX + halfSize, y }
  if (side === "top") center = { x, y: insideRegion.d.bounds.maxY + halfSize }
  if (side === "bottom")
    center = { x, y: insideRegion.d.bounds.minY - halfSize }

  return {
    regionId,
    ports: [],
    d: {
      bounds: {
        minX: center.x - halfSize,
        maxX: center.x + halfSize,
        minY: center.y - halfSize,
        maxY: center.y + halfSize,
      },
      center,
      isPad: false,
      isConnectionRegion: true,
    },
    assignments: [],
  }
}

const getClosestBoundarySide = (
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  point: { x: number; y: number },
): "left" | "right" | "top" | "bottom" => {
  const sideDistances = [
    { side: "left" as const, distance: Math.abs(point.x - bounds.minX) },
    { side: "right" as const, distance: Math.abs(point.x - bounds.maxX) },
    { side: "top" as const, distance: Math.abs(point.y - bounds.maxY) },
    { side: "bottom" as const, distance: Math.abs(point.y - bounds.minY) },
  ]
  sideDistances.sort((a, b) => a.distance - b.distance)
  return sideDistances[0]!.side
}

const getOtherNonBoundaryRegionId = (
  port: RegionPort,
  boundaryRegionIds: Set<string>,
): string | undefined => {
  if (!boundaryRegionIds.has(port.region1.regionId))
    return port.region1.regionId
  if (!boundaryRegionIds.has(port.region2.regionId))
    return port.region2.regionId
  return undefined
}

const isSyntheticBoundaryRegion = (region: Region): boolean => {
  return (
    region.regionId.startsWith("__section_boundary__") ||
    Boolean(region.d?.isBoundaryRegion)
  )
}
