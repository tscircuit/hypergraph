import type {
  Connection,
  ConnectionId,
  HyperGraph,
  PortId,
  RegionId,
  SerializedConnection,
  SerializedHyperGraph,
  SerializedSolvedRoute,
} from "./types"

export type GraphArena = {
  regionCount: number
  portCount: number
  connectionCount: number
  networkCount: number
  regionIds: RegionId[]
  portIds: PortId[]
  connectionIds: ConnectionId[]
  networkIds: string[]
  regionData: unknown[]
  portData: unknown[]
  portRegionA: Int32Array
  portRegionB: Int32Array
  regionPortStart: Int32Array
  regionPortIndex: Int32Array
  connectionStartRegion: Int32Array
  connectionEndRegion: Int32Array
  connectionNet: Int32Array
  regionIdToIndex: Map<RegionId, number>
  portIdToIndex: Map<PortId, number>
  connectionIdToIndex: Map<ConnectionId, number>
}

export type SolveState = {
  routeCount: number
  routeConnectionIndex: Int32Array
  routeOffset: Int32Array
  routeLength: Int32Array
  routeRequiredRip: Uint8Array
  routeCandidateRip: Uint8Array
  routeLastRegionSeq: Int32Array
  routeNextRegionSeq: Int32Array
  routePortSeq: Int32Array
  portAssignedConnection: Int32Array
  portAssignedRoute: Int32Array
  portRipCount: Int32Array
  assignmentCount: number
  assignRegion: Int32Array
  assignPortA: Int32Array
  assignPortB: Int32Array
  assignConnection: Int32Array
  assignRoute: Int32Array
  assignNext: Int32Array
  regionAssignHead: Int32Array
}

export type ExtractSectionViewInput = {
  arena: GraphArena
  state: SolveState
  centralRegionId?: RegionId
  centralRegionIndex?: number
  expansionHopsFromCentralRegion: number
}

export type SectionView = {
  centralRegion: number
  regionMark: Uint8Array
  portMark: Uint8Array
  regionIndices: Int32Array
  portIndices: Int32Array
  internalPortIndices: Int32Array
  boundaryPortIndices: Int32Array
  boundaryInsideRegion: Int32Array
  boundaryOutsideRegion: Int32Array
  sectionRoutes: Int32Array
  sectionConnections: Int32Array
  spanStart: Int32Array
  spanEnd: Int32Array
}

export type MaterializeSectionGraphInput = {
  arena: GraphArena
  state: SolveState
  sectionView: SectionView
}

export const compileGraphArena = (
  inputGraph: SerializedHyperGraph | HyperGraph,
): GraphArena => {
  const regionEntries = inputGraph.regions.map((region) => ({
    regionId: region.regionId,
    d: region.d,
  }))
  const regionIds = regionEntries.map((region) => region.regionId)
  const regionData = regionEntries.map((region) => region.d)
  const regionIdToIndex = new Map(
    regionIds.map((regionId, index) => [regionId, index]),
  )

  const portEntries = inputGraph.ports.map((port) => ({
    portId: port.portId,
    regionAId: "region1Id" in port ? port.region1Id : port.region1.regionId,
    regionBId: "region2Id" in port ? port.region2Id : port.region2.regionId,
    d: port.d,
  }))
  const portIds = portEntries.map((port) => port.portId)
  const portData = portEntries.map((port) => port.d)
  const portIdToIndex = new Map(portIds.map((portId, index) => [portId, index]))

  const portRegionA = new Int32Array(portEntries.length)
  const portRegionB = new Int32Array(portEntries.length)
  const regionPortCounts = new Int32Array(regionEntries.length)

  for (let portIndex = 0; portIndex < portEntries.length; portIndex++) {
    const port = portEntries[portIndex]!
    const regionAIndex = getRequiredIndex(
      regionIdToIndex,
      port.regionAId,
      `Port ${port.portId} references missing region ${port.regionAId}`,
    )
    const regionBIndex = getRequiredIndex(
      regionIdToIndex,
      port.regionBId,
      `Port ${port.portId} references missing region ${port.regionBId}`,
    )

    portRegionA[portIndex] = regionAIndex
    portRegionB[portIndex] = regionBIndex
    regionPortCounts[regionAIndex] += 1
    regionPortCounts[regionBIndex] += 1
  }

  const regionPortStart = new Int32Array(regionEntries.length + 1)
  for (let regionIndex = 0; regionIndex < regionEntries.length; regionIndex++) {
    regionPortStart[regionIndex + 1] =
      regionPortStart[regionIndex] + regionPortCounts[regionIndex]!
  }

  const regionPortIndex = new Int32Array(
    regionPortStart[regionPortStart.length - 1]!,
  )
  const regionPortCursor = Int32Array.from(regionPortStart.slice(0, -1))

  for (let portIndex = 0; portIndex < portEntries.length; portIndex++) {
    const regionAIndex = portRegionA[portIndex]!
    const regionBIndex = portRegionB[portIndex]!

    regionPortIndex[regionPortCursor[regionAIndex]!] = portIndex
    regionPortCursor[regionAIndex] += 1

    regionPortIndex[regionPortCursor[regionBIndex]!] = portIndex
    regionPortCursor[regionBIndex] += 1
  }

  const connectionEntries = collectConnectionEntries(inputGraph)
  const connectionIds = connectionEntries.map(
    (connection) => connection.connectionId,
  )
  const connectionIdToIndex = new Map(
    connectionIds.map((connectionId, index) => [connectionId, index]),
  )

  const networkIds: string[] = []
  const networkIdToIndex = new Map<string, number>()
  const connectionStartRegion = new Int32Array(connectionEntries.length)
  const connectionEndRegion = new Int32Array(connectionEntries.length)
  const connectionNet = new Int32Array(connectionEntries.length)

  for (
    let connectionIndex = 0;
    connectionIndex < connectionEntries.length;
    connectionIndex++
  ) {
    const connection = connectionEntries[connectionIndex]!
    connectionStartRegion[connectionIndex] = getRequiredIndex(
      regionIdToIndex,
      connection.startRegionId,
      `Connection ${connection.connectionId} references missing start region ${connection.startRegionId}`,
    )
    connectionEndRegion[connectionIndex] = getRequiredIndex(
      regionIdToIndex,
      connection.endRegionId,
      `Connection ${connection.connectionId} references missing end region ${connection.endRegionId}`,
    )

    const networkId =
      connection.mutuallyConnectedNetworkId ?? connection.connectionId
    let networkIndex = networkIdToIndex.get(networkId)
    if (networkIndex === undefined) {
      networkIndex = networkIds.length
      networkIds.push(networkId)
      networkIdToIndex.set(networkId, networkIndex)
    }
    connectionNet[connectionIndex] = networkIndex
  }

  return {
    regionCount: regionEntries.length,
    portCount: portEntries.length,
    connectionCount: connectionEntries.length,
    networkCount: networkIds.length,
    regionIds,
    portIds,
    connectionIds,
    networkIds,
    regionData,
    portData,
    portRegionA,
    portRegionB,
    regionPortStart,
    regionPortIndex,
    connectionStartRegion,
    connectionEndRegion,
    connectionNet,
    regionIdToIndex,
    portIdToIndex,
    connectionIdToIndex,
  }
}

export const compileSolveState = (
  inputGraph: Pick<SerializedHyperGraph, "solvedRoutes">,
  arena: GraphArena,
): SolveState => {
  const solvedRoutes = inputGraph.solvedRoutes ?? []
  const routeCount = solvedRoutes.length
  const routeConnectionIndex = new Int32Array(routeCount)
  const routeOffset = new Int32Array(routeCount)
  const routeLength = new Int32Array(routeCount)
  const routeRequiredRip = new Uint8Array(routeCount)

  let totalRoutePortCount = 0
  for (let routeIndex = 0; routeIndex < routeCount; routeIndex++) {
    totalRoutePortCount += solvedRoutes[routeIndex]!.path.length
  }

  const routePortSeq = new Int32Array(totalRoutePortCount)
  const routeCandidateRip = new Uint8Array(totalRoutePortCount)
  const routeLastRegionSeq = new Int32Array(totalRoutePortCount).fill(-1)
  const routeNextRegionSeq = new Int32Array(totalRoutePortCount).fill(-1)
  const portAssignedConnection = new Int32Array(arena.portCount).fill(-1)
  const portAssignedRoute = new Int32Array(arena.portCount).fill(-1)
  const portRipCount = new Int32Array(arena.portCount)
  const regionAssignHead = new Int32Array(arena.regionCount).fill(-1)

  let assignmentCount = 0
  for (let routeIndex = 0; routeIndex < routeCount; routeIndex++) {
    const route = solvedRoutes[routeIndex]!
    assignmentCount += Math.max(0, route.path.length - 1)
  }

  const assignRegion = new Int32Array(assignmentCount)
  const assignPortA = new Int32Array(assignmentCount)
  const assignPortB = new Int32Array(assignmentCount)
  const assignConnection = new Int32Array(assignmentCount)
  const assignRoute = new Int32Array(assignmentCount)
  const assignNext = new Int32Array(assignmentCount).fill(-1)

  let nextRouteOffset = 0
  let nextAssignmentIndex = 0

  for (let routeIndex = 0; routeIndex < routeCount; routeIndex++) {
    const route = solvedRoutes[routeIndex]!
    routeOffset[routeIndex] = nextRouteOffset
    routeLength[routeIndex] = route.path.length
    routeRequiredRip[routeIndex] = route.requiredRip ? 1 : 0
    routeConnectionIndex[routeIndex] = getRequiredIndex(
      arena.connectionIdToIndex,
      route.connection.connectionId,
      `Solved route references missing connection ${route.connection.connectionId}`,
    )

    for (let pathIndex = 0; pathIndex < route.path.length; pathIndex++) {
      const candidate = route.path[pathIndex]!
      const portIndex = getRequiredIndex(
        arena.portIdToIndex,
        candidate.portId,
        `Solved route ${route.connection.connectionId} references missing port ${candidate.portId}`,
      )
      routePortSeq[nextRouteOffset + pathIndex] = portIndex
      routeCandidateRip[nextRouteOffset + pathIndex] = candidate.ripRequired
        ? 1
        : 0
      routeLastRegionSeq[nextRouteOffset + pathIndex] =
        candidate.lastRegionId !== undefined
          ? getRequiredIndex(
              arena.regionIdToIndex,
              candidate.lastRegionId,
              `Solved route ${route.connection.connectionId} references missing last region ${candidate.lastRegionId}`,
            )
          : -1
      routeNextRegionSeq[nextRouteOffset + pathIndex] =
        candidate.nextRegionId !== undefined
          ? getRequiredIndex(
              arena.regionIdToIndex,
              candidate.nextRegionId,
              `Solved route ${route.connection.connectionId} references missing next region ${candidate.nextRegionId}`,
            )
          : -1
      portAssignedConnection[portIndex] = routeConnectionIndex[routeIndex]!
      portAssignedRoute[portIndex] = routeIndex
      portRipCount[portIndex] += 1

      if (pathIndex === 0) continue

      const previousPortIndex = routePortSeq[nextRouteOffset + pathIndex - 1]!
      const previousNextRegionIndex =
        routeNextRegionSeq[nextRouteOffset + pathIndex - 1]!
      const regionIndex =
        routeLastRegionSeq[nextRouteOffset + pathIndex] !== -1
          ? routeLastRegionSeq[nextRouteOffset + pathIndex]!
          : previousNextRegionIndex !== -1
            ? previousNextRegionIndex
            : getSharedRegionIndex(arena, previousPortIndex, portIndex)
      if (regionIndex === -1) continue

      assignRegion[nextAssignmentIndex] = regionIndex
      assignPortA[nextAssignmentIndex] = previousPortIndex
      assignPortB[nextAssignmentIndex] = portIndex
      assignConnection[nextAssignmentIndex] = routeConnectionIndex[routeIndex]!
      assignRoute[nextAssignmentIndex] = routeIndex
      assignNext[nextAssignmentIndex] = regionAssignHead[regionIndex]!
      regionAssignHead[regionIndex] = nextAssignmentIndex
      nextAssignmentIndex += 1
    }

    nextRouteOffset += route.path.length
  }

  return {
    routeCount,
    routeConnectionIndex,
    routeOffset,
    routeLength,
    routeRequiredRip,
    routeCandidateRip,
    routeLastRegionSeq,
    routeNextRegionSeq,
    routePortSeq,
    portAssignedConnection,
    portAssignedRoute,
    portRipCount,
    assignmentCount: nextAssignmentIndex,
    assignRegion,
    assignPortA,
    assignPortB,
    assignConnection,
    assignRoute,
    assignNext,
    regionAssignHead,
  }
}

export const extractSectionView = (
  input: ExtractSectionViewInput,
): SectionView => {
  const { arena, state, expansionHopsFromCentralRegion } = input
  const centralRegion =
    input.centralRegionIndex ??
    getRequiredIndex(
      arena.regionIdToIndex,
      input.centralRegionId,
      `Central region ${input.centralRegionId} not found in graph arena`,
    )

  const regionMark = new Uint8Array(arena.regionCount)
  const portMark = new Uint8Array(arena.portCount)
  const regionIndices: number[] = []
  const portIndices: number[] = []
  const internalPortIndices: number[] = []
  const boundaryPortIndices: number[] = []
  const boundaryInsideRegion: number[] = []
  const boundaryOutsideRegion: number[] = []

  const queue: number[] = [centralRegion]
  const queueHops: number[] = [0]
  regionMark[centralRegion] = 1
  regionIndices.push(centralRegion)

  while (queue.length > 0) {
    const regionIndex = queue.shift()!
    const hops = queueHops.shift()!
    if (hops >= expansionHopsFromCentralRegion + 1) continue

    const start = arena.regionPortStart[regionIndex]!
    const end = arena.regionPortStart[regionIndex + 1]!

    for (let i = start; i < end; i++) {
      const portIndex = arena.regionPortIndex[i]!
      const nextRegion = getOtherRegionIndexForPort(
        arena,
        portIndex,
        regionIndex,
      )
      if (regionMark[nextRegion] === 1) continue
      regionMark[nextRegion] = 1
      regionIndices.push(nextRegion)
      queue.push(nextRegion)
      queueHops.push(hops + 1)
    }
  }

  for (let portIndex = 0; portIndex < arena.portCount; portIndex++) {
    const regionA = arena.portRegionA[portIndex]!
    const regionB = arena.portRegionB[portIndex]!
    const regionAInSection = regionMark[regionA] === 1
    const regionBInSection = regionMark[regionB] === 1

    if (!regionAInSection && !regionBInSection) continue

    portMark[portIndex] = 1
    portIndices.push(portIndex)

    if (regionAInSection && regionBInSection) {
      internalPortIndices.push(portIndex)
      continue
    }

    boundaryPortIndices.push(portIndex)
    boundaryInsideRegion.push(regionAInSection ? regionA : regionB)
    boundaryOutsideRegion.push(regionAInSection ? regionB : regionA)
  }

  const sectionRoutes: number[] = []
  const sectionConnections: number[] = []
  const spanStart: number[] = []
  const spanEnd: number[] = []

  for (let routeIndex = 0; routeIndex < state.routeCount; routeIndex++) {
    const routeStart = state.routeOffset[routeIndex]!
    const routeLength = state.routeLength[routeIndex]!
    let startIndex = -1
    let endIndex = -1

    for (let pathIndex = 0; pathIndex < routeLength; pathIndex++) {
      const lastRegion = state.routeLastRegionSeq[routeStart + pathIndex]!
      const nextRegion = state.routeNextRegionSeq[routeStart + pathIndex]!
      const touchesSection =
        (lastRegion !== -1 && regionMark[lastRegion] === 1) ||
        (nextRegion !== -1 && regionMark[nextRegion] === 1)

      if (!touchesSection) continue
      if (startIndex === -1) startIndex = pathIndex
      endIndex = pathIndex
    }

    if (startIndex === -1) continue

    sectionRoutes.push(routeIndex)
    sectionConnections.push(state.routeConnectionIndex[routeIndex]!)
    spanStart.push(startIndex)
    spanEnd.push(endIndex)
  }

  return {
    centralRegion,
    regionMark,
    portMark,
    regionIndices: Int32Array.from(regionIndices),
    portIndices: Int32Array.from(portIndices),
    internalPortIndices: Int32Array.from(internalPortIndices),
    boundaryPortIndices: Int32Array.from(boundaryPortIndices),
    boundaryInsideRegion: Int32Array.from(boundaryInsideRegion),
    boundaryOutsideRegion: Int32Array.from(boundaryOutsideRegion),
    sectionRoutes: Int32Array.from(sectionRoutes),
    sectionConnections: Int32Array.from(sectionConnections),
    spanStart: Int32Array.from(spanStart),
    spanEnd: Int32Array.from(spanEnd),
  }
}

export const materializeSerializedGraphArena = (
  arena: GraphArena,
): SerializedHyperGraph => {
  const ports = arena.portIds.map((portId, portIndex) => ({
    portId,
    region1Id: arena.regionIds[arena.portRegionA[portIndex]!]!,
    region2Id: arena.regionIds[arena.portRegionB[portIndex]!]!,
    d: arena.portData[portIndex],
  }))
  const regions = arena.regionIds.map((regionId, regionIndex) => {
    const start = arena.regionPortStart[regionIndex]!
    const end = arena.regionPortStart[regionIndex + 1]!
    const pointIds: PortId[] = []
    for (let i = start; i < end; i++) {
      pointIds.push(arena.portIds[arena.regionPortIndex[i]!]!)
    }
    return {
      regionId,
      pointIds,
      d: arena.regionData[regionIndex],
    }
  })
  const connections = arena.connectionIds.map(
    (connectionId, connectionIndex) => ({
      connectionId,
      startRegionId:
        arena.regionIds[arena.connectionStartRegion[connectionIndex]!]!,
      endRegionId:
        arena.regionIds[arena.connectionEndRegion[connectionIndex]!]!,
      mutuallyConnectedNetworkId:
        arena.networkIds[arena.connectionNet[connectionIndex]!]!,
    }),
  )

  return {
    ports,
    regions,
    connections,
  }
}

export const materializeSerializedSectionGraph = ({
  arena,
  state,
  sectionView,
}: MaterializeSectionGraphInput): SerializedHyperGraph => {
  const boundaryRegionByPortIndex = new Map<
    number,
    SerializedHyperGraph["regions"][number]
  >()
  const localPortRegion1Id = new Map<number, RegionId>()
  const localPortRegion2Id = new Map<number, RegionId>()
  const regions: SerializedHyperGraph["regions"] = []
  const ports: SerializedHyperGraph["ports"] = []

  for (let regionIndex = 0; regionIndex < arena.regionCount; regionIndex++) {
    if (sectionView.regionMark[regionIndex] !== 1) continue
    regions.push({
      regionId: arena.regionIds[regionIndex]!,
      pointIds: [],
      d: cloneIfPresent(arena.regionData[regionIndex]),
    })
  }

  const regionById = new Map(regions.map((region) => [region.regionId, region]))

  for (let portIndex = 0; portIndex < arena.portCount; portIndex++) {
    if (sectionView.portMark[portIndex] !== 1) continue

    const regionAIndex = arena.portRegionA[portIndex]!
    const regionBIndex = arena.portRegionB[portIndex]!
    const regionAInSection = sectionView.regionMark[regionAIndex] === 1
    const regionBInSection = sectionView.regionMark[regionBIndex] === 1
    const portId = arena.portIds[portIndex]!

    let region1Id: RegionId
    let region2Id: RegionId

    if (regionAInSection && regionBInSection) {
      region1Id = arena.regionIds[regionAIndex]!
      region2Id = arena.regionIds[regionBIndex]!
    } else {
      const insideRegionIndex = regionAInSection ? regionAIndex : regionBIndex
      region1Id = arena.regionIds[insideRegionIndex]!
      region2Id = getOrCreateSerializedBoundaryRegion({
        arena,
        portIndex,
        boundaryRegionByPortIndex,
        regions,
      }).regionId
    }

    ports.push({
      portId,
      region1Id,
      region2Id,
      d: arena.portData[portIndex],
    })
    localPortRegion1Id.set(portIndex, region1Id)
    localPortRegion2Id.set(portIndex, region2Id)
    regionById.get(region1Id)?.pointIds.push(portId)
    regionById.get(region2Id)?.pointIds.push(portId)
  }

  const connections: SerializedConnection[] = []
  const solvedRoutes: SerializedSolvedRoute[] = []
  const sectionRouteBindings: SerializedHyperGraph["_sectionRouteBindings"] = []

  for (
    let sectionRouteIndex = 0;
    sectionRouteIndex < sectionView.sectionRoutes.length;
    sectionRouteIndex++
  ) {
    const routeIndex = sectionView.sectionRoutes[sectionRouteIndex]!
    const connectionIndex = sectionView.sectionConnections[sectionRouteIndex]!
    const routeOffset = state.routeOffset[routeIndex]!
    const routeLength = state.routeLength[routeIndex]!
    const startIndex = sectionView.spanStart[sectionRouteIndex]!
    const endIndex = sectionView.spanEnd[sectionRouteIndex]!
    const startPortIndex = state.routePortSeq[routeOffset + startIndex]!
    const endPortIndex = state.routePortSeq[routeOffset + endIndex]!
    const startRegionIndex = arena.connectionStartRegion[connectionIndex]!
    const endRegionIndex = arena.connectionEndRegion[connectionIndex]!

    const sectionConnection: SerializedConnection = {
      connectionId: arena.connectionIds[connectionIndex]!,
      startRegionId:
        sectionView.regionMark[startRegionIndex] === 1
          ? arena.regionIds[startRegionIndex]!
          : getOrCreateSerializedBoundaryRegion({
              arena,
              portIndex: startPortIndex,
              boundaryRegionByPortIndex,
              regions,
            }).regionId,
      endRegionId:
        sectionView.regionMark[endRegionIndex] === 1
          ? arena.regionIds[endRegionIndex]!
          : getOrCreateSerializedBoundaryRegion({
              arena,
              portIndex: endPortIndex,
              boundaryRegionByPortIndex,
              regions,
            }).regionId,
      mutuallyConnectedNetworkId:
        arena.networkIds[arena.connectionNet[connectionIndex]!]!,
    }

    connections.push(sectionConnection)
    sectionRouteBindings?.push({
      connectionId: sectionConnection.connectionId,
      solvedPathStartIndex: startIndex,
      solvedPathEndIndex: endIndex,
    })

    const localPortIndices: number[] = []
    const localPathOffsets: number[] = []
    for (
      let pathIndex = startIndex;
      pathIndex <= endIndex && pathIndex < routeLength;
      pathIndex++
    ) {
      const portIndex = state.routePortSeq[routeOffset + pathIndex]!
      if (sectionView.portMark[portIndex] !== 1) continue
      localPortIndices.push(portIndex)
      localPathOffsets.push(routeOffset + pathIndex)
    }

    solvedRoutes.push({
      connection: sectionConnection,
      requiredRip: state.routeRequiredRip[routeIndex] === 1,
      path: buildSerializedSectionRoutePath({
        arena,
        state,
        localPortIndices,
        localPathOffsets,
        localPortRegion1Id,
        localPortRegion2Id,
        sectionConnection,
      }),
    })
  }

  return {
    ports,
    regions,
    connections,
    solvedRoutes,
    _sectionCentralRegionId: arena.regionIds[sectionView.centralRegion]!,
    _sectionRouteBindings: sectionRouteBindings,
  }
}

export const getSharedRegionIndex = (
  arena: GraphArena,
  firstPortIndex: number,
  secondPortIndex: number,
): number => {
  const firstRegionA = arena.portRegionA[firstPortIndex]!
  const firstRegionB = arena.portRegionB[firstPortIndex]!
  const secondRegionA = arena.portRegionA[secondPortIndex]!
  const secondRegionB = arena.portRegionB[secondPortIndex]!

  if (firstRegionA === secondRegionA || firstRegionA === secondRegionB) {
    return firstRegionA
  }
  if (firstRegionB === secondRegionA || firstRegionB === secondRegionB) {
    return firstRegionB
  }
  return -1
}

export const getOtherRegionIndexForPort = (
  arena: GraphArena,
  portIndex: number,
  regionIndex: number,
): number => {
  const regionA = arena.portRegionA[portIndex]!
  const regionB = arena.portRegionB[portIndex]!
  if (regionA === regionIndex) return regionB
  if (regionB === regionIndex) return regionA
  throw new Error(
    `Port ${arena.portIds[portIndex]} does not reference region ${arena.regionIds[regionIndex]}`,
  )
}

const collectConnectionEntries = (
  inputGraph: SerializedHyperGraph | HyperGraph,
): SerializedConnection[] => {
  const dedupedConnections = new Map<ConnectionId, SerializedConnection>()

  const serializedConnections =
    "connections" in inputGraph ? (inputGraph.connections ?? []) : []
  for (const connection of serializedConnections) {
    dedupedConnections.set(connection.connectionId, connection)
  }

  const solvedRoutes =
    "solvedRoutes" in inputGraph ? (inputGraph.solvedRoutes ?? []) : []
  for (const solvedRoute of solvedRoutes ?? []) {
    const connection = solvedRoute.connection
    if (dedupedConnections.has(connection.connectionId)) continue
    dedupedConnections.set(
      connection.connectionId,
      normalizeConnection(connection),
    )
  }

  return Array.from(dedupedConnections.values())
}

const buildSerializedSectionRoutePath = ({
  arena,
  state,
  localPortIndices,
  localPathOffsets,
  localPortRegion1Id,
  localPortRegion2Id,
  sectionConnection,
}: {
  arena: GraphArena
  state: SolveState
  localPortIndices: number[]
  localPathOffsets: number[]
  localPortRegion1Id: Map<number, RegionId>
  localPortRegion2Id: Map<number, RegionId>
  sectionConnection: SerializedConnection
}): SerializedSolvedRoute["path"] => {
  const path: SerializedSolvedRoute["path"] = []
  let currentRegionId = sectionConnection.startRegionId

  for (let index = 0; index < localPortIndices.length; index++) {
    const portIndex = localPortIndices[index]!
    const portRegionAId = localPortRegion1Id.get(portIndex)
    const portRegionBId = localPortRegion2Id.get(portIndex)
    if (!portRegionAId || !portRegionBId) {
      throw new Error(
        `Port ${arena.portIds[portIndex]} is missing from local section graph`,
      )
    }
    const nextRegionId =
      portRegionAId === currentRegionId ? portRegionBId : portRegionAId
    const nextPortIndex =
      index + 1 < localPortIndices.length ? localPortIndices[index + 1]! : -1

    path.push({
      portId: arena.portIds[portIndex]!,
      g: 0,
      h: 0,
      f: 0,
      hops: index,
      ripRequired: state.routeCandidateRip[localPathOffsets[index]!] === 1,
      lastPortId:
        index > 0 ? arena.portIds[localPortIndices[index - 1]!] : undefined,
      lastRegionId: index > 0 ? currentRegionId : undefined,
      nextRegionId:
        nextPortIndex === -1
          ? nextRegionId
          : getSharedRegionIdForSectionPath(
              portIndex,
              nextPortIndex,
              localPortRegion1Id,
              localPortRegion2Id,
              currentRegionId,
            ),
    })

    currentRegionId = nextRegionId
  }

  return path
}

const getSharedRegionIdForSectionPath = (
  firstPortIndex: number,
  secondPortIndex: number,
  localPortRegion1Id: Map<number, RegionId>,
  localPortRegion2Id: Map<number, RegionId>,
  currentRegionId: RegionId,
): RegionId | undefined => {
  const firstRegionIds = [
    localPortRegion1Id.get(firstPortIndex),
    localPortRegion2Id.get(firstPortIndex),
  ]
  const secondRegionIds = new Set([
    localPortRegion1Id.get(secondPortIndex),
    localPortRegion2Id.get(secondPortIndex),
  ])

  const sharedRegionId = firstRegionIds.find(
    (regionId) => regionId !== undefined && secondRegionIds.has(regionId),
  )
  return sharedRegionId ?? currentRegionId
}

const getOrCreateSerializedBoundaryRegion = ({
  arena,
  portIndex,
  boundaryRegionByPortIndex,
  regions,
}: {
  arena: GraphArena
  portIndex: number
  boundaryRegionByPortIndex: Map<
    number,
    SerializedHyperGraph["regions"][number]
  >
  regions: SerializedHyperGraph["regions"]
}): SerializedHyperGraph["regions"][number] => {
  let boundaryRegion = boundaryRegionByPortIndex.get(portIndex)
  if (!boundaryRegion) {
    const portId = arena.portIds[portIndex]!
    const portData = arena.portData[portIndex] as
      | Record<string, unknown>
      | undefined
    const x = typeof portData?.x === "number" ? portData.x : 0
    const y = typeof portData?.y === "number" ? portData.y : 0
    boundaryRegion = {
      regionId: `__section_boundary__${portId}`,
      pointIds: [],
      d: {
        isBoundaryRegion: true,
        boundaryPortId: portId,
        ...portData,
        center: { x, y },
        bounds: {
          minX: x - 0.05,
          maxX: x + 0.05,
          minY: y - 0.05,
          maxY: y + 0.05,
        },
      },
    }
    boundaryRegionByPortIndex.set(portIndex, boundaryRegion)
    regions.push(boundaryRegion)
  }
  return boundaryRegion
}

const normalizeConnection = (
  connection: SerializedConnection | Connection,
): SerializedConnection => {
  if ("startRegionId" in connection) {
    return connection
  }
  return {
    connectionId: connection.connectionId,
    startRegionId: connection.startRegion.regionId,
    endRegionId: connection.endRegion.regionId,
    mutuallyConnectedNetworkId: connection.mutuallyConnectedNetworkId,
  }
}

const getRequiredIndex = <T>(
  indexMap: Map<T, number>,
  key: T | undefined,
  errorMessage: string,
): number => {
  if (key === undefined) {
    throw new Error(errorMessage)
  }
  const value = indexMap.get(key)
  if (value === undefined) {
    throw new Error(errorMessage)
  }
  return value
}

const cloneIfPresent = <T>(value: T): T => {
  if (value == null) return value
  return structuredClone(value)
}
