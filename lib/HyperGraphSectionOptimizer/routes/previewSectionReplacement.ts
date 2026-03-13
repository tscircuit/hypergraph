import type { HyperGraphSection } from "lib/HyperGraphSectionOptimizer/HyperGraphSectionOptimizer"
import type { Candidate, SolvedRoute } from "lib/types"

/** Produces the combined solved routes if the replacement were accepted. */
export const previewSectionReplacement = (input: {
  solvedRoutes: SolvedRoute[]
  section: HyperGraphSection
  replacementSolvedRoutes: SolvedRoute[]
}): SolvedRoute[] => {
  const { solvedRoutes, section, replacementSolvedRoutes } = input
  const replacementByConnectionId = new Map(
    replacementSolvedRoutes.map((route) => [
      route.connection.connectionId,
      route,
    ]),
  )

  return solvedRoutes.map((solvedRoute) => {
    const sectionRoute = section.sectionRoutes.find(
      (route) =>
        route.globalConnection.connectionId ===
        solvedRoute.connection.connectionId,
    )
    if (!sectionRoute) return solvedRoute

    const replacementSolvedRoute = replacementByConnectionId.get(
      solvedRoute.connection.connectionId,
    )
    if (!replacementSolvedRoute) return solvedRoute

    const path = [
      ...solvedRoute.path.slice(0, sectionRoute.sectionStartIndex),
      ...replacementSolvedRoute.path,
      ...solvedRoute.path.slice(sectionRoute.sectionEndIndex + 1),
    ]

    const copiedPath: Candidate[] = path.map((candidate) => ({
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

    for (let i = 0; i < copiedPath.length; i++) {
      copiedPath[i].parent = i > 0 ? copiedPath[i - 1] : undefined
    }

    return {
      connection: solvedRoute.connection,
      path: copiedPath,
      requiredRip:
        solvedRoute.requiredRip || replacementSolvedRoute.requiredRip,
    }
  })
}
