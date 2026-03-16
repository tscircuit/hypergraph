import type { HyperGraphSection } from "lib/HyperGraphSectionOptimizer/HyperGraphSectionOptimizer"
import type { Candidate, HyperGraph, SolvedRoute } from "lib/types"

const countRouteAssignments = (route: SolvedRoute): number =>
  route.path.reduce(
    (sum, candidate) =>
      sum + (candidate.lastPort && candidate.lastRegion ? 1 : 0),
    0,
  )

const getSharedRegionId = (
  previousPort: Candidate["port"],
  nextPort: Candidate["port"],
): string | null => {
  const previousRegionIds = new Set([
    previousPort.region1.regionId,
    previousPort.region2.regionId,
  ])
  if (previousRegionIds.has(nextPort.region1.regionId)) {
    return nextPort.region1.regionId
  }
  if (previousRegionIds.has(nextPort.region2.regionId)) {
    return nextPort.region2.regionId
  }
  return null
}

/** Produces the combined solved routes if the replacement were accepted. */
export const previewSectionReplacement = (input: {
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

  // Create mappings from section graph to global graph
  const globalPortMap = new Map(
    globalGraph.ports.map((port) => [port.portId, port]),
  )
  const globalRegionMap = new Map(
    globalGraph.regions.map((region) => [region.regionId, region]),
  )

  let replacedCount = 0
  let skippedCount = 0
  let protectedFallbackCount = 0

  const result = solvedRoutes.map((solvedRoute) => {
    const sectionRoute = section.sectionRoutes.find(
      (route) =>
        route.globalConnection.connectionId ===
        solvedRoute.connection.connectionId,
    )
    if (!sectionRoute) {
      skippedCount++
      return solvedRoute
    }

    const replacementSolvedRoute = replacementByConnectionId.get(
      solvedRoute.connection.connectionId,
    )
    if (!replacementSolvedRoute) {
      skippedCount++
      return solvedRoute
    }

    replacedCount++

    const pathBeforeSection = solvedRoute.path.slice(
      0,
      sectionRoute.sectionStartIndex,
    )
    const replacementPath = replacementSolvedRoute.path
    const pathAfterSection = solvedRoute.path.slice(
      sectionRoute.sectionEndIndex + 1,
    )

    // Keep the before/after parts as-is (they already have correct global refs)
    // Only map the replacement parts from section graph to global graph
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

    const copiedPathReplacement: Candidate[] = replacementPath.map(
      (candidate) => {
        // Map section ports/regions back to global graph
        const globalPort =
          globalPortMap.get(candidate.port.portId) ?? candidate.port
        const globalLastPort = candidate.lastPort
          ? (globalPortMap.get(candidate.lastPort.portId) ?? candidate.lastPort)
          : undefined
        // For boundary regions (which don't exist in global graph), return undefined
        // so that commitSolvedRoutes won't try to add assignments to them
        const globalLastRegion = candidate.lastRegion
          ? candidate.lastRegion.regionId.startsWith("__section_boundary__")
            ? undefined
            : (globalRegionMap.get(candidate.lastRegion.regionId) ??
              candidate.lastRegion)
          : undefined
        const globalNextRegion = candidate.nextRegion
          ? candidate.nextRegion.regionId.startsWith("__section_boundary__")
            ? undefined
            : (globalRegionMap.get(candidate.nextRegion.regionId) ??
              candidate.nextRegion)
          : undefined

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

    const originalAssignmentCount = countRouteAssignments(solvedRoute)

    for (let i = 0; i < copiedPath.length; i++) {
      const current = copiedPath[i]
      const previous = i > 0 ? copiedPath[i - 1] : undefined
      const next = i < copiedPath.length - 1 ? copiedPath[i + 1] : undefined

      current.parent = previous

      if (!previous) {
        current.lastPort = undefined
        current.lastRegion = undefined
      } else {
        const expectedLastPortId = previous.port.portId
        if (current.lastPort?.portId !== expectedLastPortId) {
          console.log(
            `[previewSectionReplacement] Fixing lastPort mismatch for connection ${solvedRoute.connection.connectionId} at index ${i}: had ${current.lastPort?.portId ?? "undefined"}, expected ${expectedLastPortId}`,
          )
          current.lastPort = previous.port
        }

        const sharedRegionId = getSharedRegionId(previous.port, current.port)
        if (!sharedRegionId) {
          console.error(
            `[previewSectionReplacement] Route discontinuity for connection ${solvedRoute.connection.connectionId} between ports ${previous.port.portId} and ${current.port.portId} at index ${i}`,
          )
        } else {
          const sharedRegion = globalRegionMap.get(sharedRegionId)
          if (!sharedRegion) {
            console.error(
              `[previewSectionReplacement] Missing shared region ${sharedRegionId} in global graph for connection ${solvedRoute.connection.connectionId}`,
            )
          } else if (current.lastRegion?.regionId !== sharedRegion.regionId) {
            console.log(
              `[previewSectionReplacement] Fixing lastRegion mismatch for connection ${solvedRoute.connection.connectionId} at index ${i}: had ${current.lastRegion?.regionId ?? "undefined"}, expected ${sharedRegion.regionId}`,
            )
            current.lastRegion = sharedRegion
          }
        }
      }

      if (!next) {
        if (current.nextRegion) {
          console.log(
            `[previewSectionReplacement] Clearing stale nextRegion on terminal candidate for connection ${solvedRoute.connection.connectionId} at index ${i}: had ${current.nextRegion.regionId}`,
          )
        }
        current.nextRegion = undefined
      } else {
        const inferredNextRegionId = getSharedRegionId(current.port, next.port)

        if (!inferredNextRegionId) {
          console.error(
            `[previewSectionReplacement] Cannot infer nextRegion for connection ${solvedRoute.connection.connectionId} between ports ${current.port.portId} and ${next.port.portId} at index ${i}`,
          )
        } else {
          const inferredNextRegion = globalRegionMap.get(inferredNextRegionId)
          if (!inferredNextRegion) {
            console.error(
              `[previewSectionReplacement] Missing inferred nextRegion ${inferredNextRegionId} in global graph for connection ${solvedRoute.connection.connectionId}`,
            )
          } else if (
            current.nextRegion?.regionId !== inferredNextRegion.regionId
          ) {
            current.nextRegion = inferredNextRegion
          }
        }
      }
    }

    const replacementAssignmentCount = countRouteAssignments({
      connection: solvedRoute.connection,
      path: copiedPath,
      requiredRip: solvedRoute.requiredRip,
    })

    if (replacementAssignmentCount < originalAssignmentCount - 1) {
      console.log(
        `[previewSectionReplacement] Assignment drop for connection ${solvedRoute.connection.connectionId}: ${originalAssignmentCount} -> ${replacementAssignmentCount}`,
      )
    }

    if (originalAssignmentCount > 0 && replacementAssignmentCount === 0) {
      protectedFallbackCount++
      console.warn(
        `[previewSectionReplacement] Protected fallback for connection ${solvedRoute.connection.connectionId}: replacement removed all assignments (${originalAssignmentCount} -> 0), keeping original route`,
      )
      return solvedRoute
    }

    return {
      connection: solvedRoute.connection,
      path: copiedPath,
      requiredRip:
        solvedRoute.requiredRip || replacementSolvedRoute.requiredRip,
    }
  })

  console.log(
    `[previewSectionReplacement] Replaced ${replacedCount} routes, skipped ${skippedCount}, protected fallbacks ${protectedFallbackCount}`,
  )
  return result
}
