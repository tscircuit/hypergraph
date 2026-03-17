import type {
  HyperGraphSection,
  SectionRoute,
} from "lib/HyperGraphSectionOptimizer/HyperGraphSectionOptimizer"
import type {
  Connection,
  HyperGraph,
  Region,
  RegionId,
  RegionPort,
  SolvedRoute,
} from "../../types"
import { getOrCreateBoundaryRegion } from "../getOrCreateBoundaryRegion"
import { sliceSolvedRouteIntoLocalSection } from "../routes/sliceSolvedRouteIntoLocalSection"
import { getRouteSectionSpan } from "./getRouteSectionSpan"
import { getSectionRegionIds } from "./getSectionRegionIds"

/** Extracts a focused section of the graph together with its local routes. */
export const getSectionOfHyperGraphAsHyperGraph = (input: {
  graph: HyperGraph
  solvedRoutes: SolvedRoute[]
  centralRegion: Region
  expansionHopsFromCentralRegion: number
}): HyperGraphSection => {
  const { graph, solvedRoutes, centralRegion, expansionHopsFromCentralRegion } =
    input
  const sectionRegionIds = getSectionRegionIds({
    graph,
    centralRegion,
    expansionHopsFromCentralRegion,
  })

  const clonedRegionMap = new Map<RegionId, Region>()
  const boundaryRegionMap = new Map<string, Region>()
  const clonedPorts: RegionPort[] = []

  for (const region of graph.regions) {
    if (!sectionRegionIds.has(region.regionId)) continue
    clonedRegionMap.set(region.regionId, {
      regionId: region.regionId,
      ports: [],
      d: region.d ? structuredClone(region.d) : region.d,
      assignments: [],
    })
  }

  for (const port of graph.ports) {
    const region1InSection = sectionRegionIds.has(port.region1.regionId)
    const region2InSection = sectionRegionIds.has(port.region2.regionId)
    if (!region1InSection && !region2InSection) continue

    if (region1InSection && region2InSection) {
      const clonedPort: RegionPort = {
        portId: port.portId,
        region1: clonedRegionMap.get(port.region1.regionId)!,
        region2: clonedRegionMap.get(port.region2.regionId)!,
        d: port.d,
      }
      clonedPort.region1.ports.push(clonedPort)
      clonedPort.region2.ports.push(clonedPort)
      clonedPorts.push(clonedPort)
      continue
    }

    const insideRegion = region1InSection ? port.region1 : port.region2
    const boundaryRegion = getOrCreateBoundaryRegion({
      port,
      boundaryRegionMap,
    })
    const clonedPort: RegionPort = {
      portId: port.portId,
      region1: clonedRegionMap.get(insideRegion.regionId)!,
      region2: boundaryRegion,
      d: port.d,
    }
    clonedPort.region1.ports.push(clonedPort)
    clonedPort.region2.ports.push(clonedPort)
    clonedPorts.push(clonedPort)
  }

  const sectionGraph: HyperGraph = {
    regions: [...clonedRegionMap.values(), ...boundaryRegionMap.values()],
    ports: clonedPorts,
  }

  const sectionRoutes: SectionRoute[] = []
  const sectionConnections: Connection[] = []
  const sectionRouteSegments: Array<{
    solvedRoute: SolvedRoute
    solvedPathStartIndex: number
    solvedPathEndIndex: number
    startCandidate: SolvedRoute["path"][number]
    endCandidate: SolvedRoute["path"][number]
  }> = []

  for (const solvedRoute of solvedRoutes) {
    const routePathSegment = getRouteSectionSpan(solvedRoute, sectionRegionIds)
    if (!routePathSegment) continue

    const startCandidate = solvedRoute.path[routePathSegment.startIndex]
    const endCandidate = solvedRoute.path[routePathSegment.endIndex]
    sectionRouteSegments.push({
      solvedRoute,
      solvedPathStartIndex: routePathSegment.startIndex,
      solvedPathEndIndex: routePathSegment.endIndex,
      startCandidate,
      endCandidate,
    })
  }

  const sectionRegionMap = new Map(
    sectionGraph.regions.map((region) => [region.regionId, region]),
  )

  for (const {
    solvedRoute,
    solvedPathStartIndex,
    solvedPathEndIndex,
    startCandidate,
    endCandidate,
  } of sectionRouteSegments) {
    let startRegionId: string
    let startRegion: Region
    if (sectionRegionIds.has(solvedRoute.connection.startRegion.regionId)) {
      startRegionId = solvedRoute.connection.startRegion.regionId
      startRegion = sectionRegionMap.get(startRegionId)!
    } else {
      // Create boundary region for start
      const boundaryRegion = getOrCreateBoundaryRegion({
        port: startCandidate.port,
        boundaryRegionMap,
      })
      startRegionId = boundaryRegion.regionId
      startRegion = boundaryRegion
      if (!sectionRegionMap.has(startRegionId)) {
        sectionRegionMap.set(startRegionId, boundaryRegion)
      }
    }

    let endRegionId: string
    let endRegion: Region
    if (sectionRegionIds.has(solvedRoute.connection.endRegion.regionId)) {
      endRegionId = solvedRoute.connection.endRegion.regionId
      endRegion = sectionRegionMap.get(endRegionId)!
    } else {
      // Create boundary region for end
      const boundaryRegion = getOrCreateBoundaryRegion({
        port: endCandidate.port,
        boundaryRegionMap,
      })
      endRegionId = boundaryRegion.regionId
      endRegion = boundaryRegion
      if (!sectionRegionMap.has(endRegionId)) {
        sectionRegionMap.set(endRegionId, boundaryRegion)
      }
    }
    if (!startRegion) {
      console.error(
        `[getSectionOfHyperGraphAsHyperGraph] CRITICAL ERROR: startRegion not found!`,
      )
      console.error(`  Looking for: ${startRegionId}`)
      console.error(
        `  Route connection: ${solvedRoute.connection.connectionId}`,
      )
      console.error(
        `  Original startRegion: ${solvedRoute.connection.startRegion.regionId}`,
      )
      console.error(`  startCandidate port: ${startCandidate.port.portId}`)
      console.error(
        `  Available regions in sectionRegionMap:`,
        Array.from(sectionRegionMap.keys()),
      )
      throw new Error(
        `startRegion ${startRegionId} not found in sectionRegionMap`,
      )
    }

    if (!endRegion) {
      console.error(
        `[getSectionOfHyperGraphAsHyperGraph] CRITICAL ERROR: endRegion not found!`,
      )
      console.error(`  Looking for: ${endRegionId}`)
      console.error(
        `  Route connection: ${solvedRoute.connection.connectionId}`,
      )
      console.error(
        `  Original endRegion: ${solvedRoute.connection.endRegion.regionId}`,
      )
      console.error(`  endCandidate port: ${endCandidate.port.portId}`)
      console.error(
        `  Available regions in sectionRegionMap:`,
        Array.from(sectionRegionMap.keys()),
      )
      throw new Error(`endRegion ${endRegionId} not found in sectionRegionMap`)
    }

    const sectionConnection: Connection = {
      connectionId: solvedRoute.connection.connectionId,
      mutuallyConnectedNetworkId:
        solvedRoute.connection.mutuallyConnectedNetworkId,
      startRegion,
      endRegion,
    }
    const rawPath = solvedRoute.path.slice(
      solvedPathStartIndex,
      solvedPathEndIndex + 1,
    )
    const sectionRouteBase = {
      globalRoute: solvedRoute,
      globalConnection: solvedRoute.connection,
      sectionConnection,
      sectionStartIndex: solvedPathStartIndex,
      sectionEndIndex: solvedPathEndIndex,
    }
    sectionRoutes.push({
      ...sectionRouteBase,
      canRemainFixedInSectionSolve: rawPath.every((candidate) =>
        sectionGraph.ports.some(
          (port) => port.portId === candidate.port.portId,
        ),
      ),
      sectionRoute: sliceSolvedRouteIntoLocalSection({
        sectionRoute: sectionRouteBase,
        graph: sectionGraph,
      }),
    })
    sectionConnections.push(sectionConnection)
  }

  return {
    centralRegionId: centralRegion.regionId,
    sectionRegionIds,
    graph: sectionGraph,
    connections: sectionConnections,
    sectionRoutes,
  }
}
