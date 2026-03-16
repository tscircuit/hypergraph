import type { HyperGraphSection } from "lib/HyperGraphSectionOptimizer/HyperGraphSectionOptimizer"
import { getSharedRegionId } from "lib/HyperGraphSectionOptimizer/helpers/getSharedRegionId"
import type { Candidate, HyperGraph, RegionPort, SolvedRoute } from "lib/types"

/**
 * Splices section-optimized routes into the global route set.
 * Takes routes solved within a section subgraph and merges them back into the full route list,
 * mapping section graph references (ports/regions) back to their global equivalents.
 *
 * @param solvedRoutes - Current global solved routes
 * @param section - The section being optimized with metadata about which routes it contains
 * @param replacementSolvedRoutes - New routes from section solver to splice in
 * @param globalGraph - The full graph (needed to map section graph regions/ports back to global equivalents,
 *                       since section graphs may have temporary boundary regions that don't exist globally)
 * @returns Combined route set with section routes replaced by their optimized versions
 */
export const mergeSectionRoutesIntoGlobal = (input: {
  solvedRoutes: SolvedRoute[]
  section: HyperGraphSection
  replacementSolvedRoutes: SolvedRoute[]
  globalGraph: HyperGraph
}): SolvedRoute[] => {
  const { solvedRoutes, section, replacementSolvedRoutes, globalGraph } = input
  const replacementByConnectionId = new Map(
    replacementSolvedRoutes.map((route) => [
      route.connection.connectionId,
      route,
    ]),
  )

  const globalPortMap = new Map(
    globalGraph.ports.map((port) => [port.portId, port]),
  )
  const globalRegionMap = new Map(
    globalGraph.regions.map((region) => [region.regionId, region]),
  )

  const result = solvedRoutes.map((solvedRoute) => {
    const sectionRoute = section.sectionRoutes.find(
      (route) =>
        route.globalConnection.connectionId ===
        solvedRoute.connection.connectionId,
    )
    if (!sectionRoute) {
      return solvedRoute
    }

    const replacementSolvedRoute = replacementByConnectionId.get(
      solvedRoute.connection.connectionId,
    )
    if (!replacementSolvedRoute) {
      return solvedRoute
    }

    const pathBeforeSection = solvedRoute.path.slice(
      0,
      sectionRoute.sectionStartIndex,
    )
    const replacementPath = replacementSolvedRoute.path
    const pathAfterSection = solvedRoute.path.slice(
      sectionRoute.sectionEndIndex + 1,
    )

    const copiedPathBefore: Candidate[] = pathBeforeSection.map(
      (candidate) => ({
        port: candidate.port,
        g: candidate.g,
        h: candidate.h,
        f: candidate.f,
        hops: candidate.hops,
        ripRequired: candidate.ripRequired,
        lastPort: candidate.lastPort,
        lastRegion: candidate.lastRegion,
        nextRegion: candidate.nextRegion,
      }),
    )

    // Map section graph candidates to global graph (section may have boundary regions)
    const copiedPathReplacement: Candidate[] = replacementPath.map(
      (candidate) => {
        const globalPort =
          globalPortMap.get(candidate.port.portId) ?? candidate.port

        let globalLastPort: RegionPort | undefined
        if (candidate.lastPort) {
          globalLastPort =
            globalPortMap.get(candidate.lastPort.portId) ?? candidate.lastPort
        }

        let globalLastRegion = candidate.lastRegion
        if (candidate.lastRegion) {
          if (candidate.lastRegion.isSectionBoundary) {
            globalLastRegion = undefined
          } else {
            globalLastRegion =
              globalRegionMap.get(candidate.lastRegion.regionId) ??
              candidate.lastRegion
          }
        }

        let globalNextRegion = candidate.nextRegion
        if (candidate.nextRegion) {
          if (candidate.nextRegion.isSectionBoundary) {
            globalNextRegion = undefined
          } else {
            globalNextRegion =
              globalRegionMap.get(candidate.nextRegion.regionId) ??
              candidate.nextRegion
          }
        }

        return {
          port: globalPort,
          g: candidate.g,
          h: candidate.h,
          f: candidate.f,
          hops: candidate.hops,
          ripRequired: candidate.ripRequired,
          lastPort: globalLastPort,
          lastRegion: globalLastRegion,
          nextRegion: globalNextRegion,
        }
      },
    )

    const copiedPathAfter: Candidate[] = pathAfterSection.map((candidate) => ({
      port: candidate.port,
      g: candidate.g,
      h: candidate.h,
      f: candidate.f,
      hops: candidate.hops,
      ripRequired: candidate.ripRequired,
      lastPort: candidate.lastPort,
      lastRegion: candidate.lastRegion,
      nextRegion: candidate.nextRegion,
    }))

    const copiedPath = [
      ...copiedPathBefore,
      ...copiedPathReplacement,
      ...copiedPathAfter,
    ]

    const originalAssignmentCount = solvedRoute.path.reduce(
      (sum, candidate) =>
        sum + (candidate.lastPort && candidate.lastRegion ? 1 : 0),
      0,
    )

    // Fix up parent/lastPort/lastRegion/nextRegion references after splicing paths together.
    // These may be incorrect after mapping from section graph to global graph.
    for (let i = 0; i < copiedPath.length; i++) {
      const current = copiedPath[i]
      const previous = i > 0 ? copiedPath[i - 1] : undefined
      const next = i < copiedPath.length - 1 ? copiedPath[i + 1] : undefined

      current.parent = previous

      if (!previous) {
        current.lastPort = undefined
        current.lastRegion = undefined
      } else {
        if (current.lastPort?.portId !== previous.port.portId) {
          current.lastPort = previous.port
        }

        const sharedRegionId = getSharedRegionId(previous.port, current.port)
        if (sharedRegionId) {
          const sharedRegion = globalRegionMap.get(sharedRegionId)
          if (
            sharedRegion &&
            current.lastRegion?.regionId !== sharedRegion.regionId
          ) {
            current.lastRegion = sharedRegion
          }
        }
      }

      if (!next) {
        current.nextRegion = undefined
      } else {
        const inferredNextRegionId = getSharedRegionId(current.port, next.port)
        if (inferredNextRegionId) {
          const inferredNextRegion = globalRegionMap.get(inferredNextRegionId)
          if (
            inferredNextRegion &&
            current.nextRegion?.regionId !== inferredNextRegion.regionId
          ) {
            current.nextRegion = inferredNextRegion
          }
        }
      }
    }

    const replacementAssignmentCount = copiedPath.reduce(
      (sum, candidate) =>
        sum + (candidate.lastPort && candidate.lastRegion ? 1 : 0),
      0,
    )

    if (originalAssignmentCount > 0 && replacementAssignmentCount === 0) {
      throw new Error(
        `Route replacement would remove all assignments for connection ${solvedRoute.connection.connectionId}`,
      )
    }

    return {
      connection: solvedRoute.connection,
      path: copiedPath,
      requiredRip:
        solvedRoute.requiredRip || replacementSolvedRoute.requiredRip,
    }
  })

  return result
}
