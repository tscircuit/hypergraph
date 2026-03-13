import type { RegionId, SolvedRoute } from "lib/types"

/** Determines the portion of a solved route that intersects the section. */
export const getRouteSectionSpan = (
  route: SolvedRoute,
  sectionRegionIds: Set<RegionId>,
): { startIndex: number; endIndex: number } | null => {
  let startIndex = -1
  let endIndex = -1

  for (let i = 0; i < route.path.length; i++) {
    const candidate = route.path[i]
    const touchesSection =
      (candidate.lastRegion &&
        sectionRegionIds.has(candidate.lastRegion.regionId)) ||
      (candidate.nextRegion &&
        sectionRegionIds.has(candidate.nextRegion.regionId))

    if (!touchesSection) continue
    if (startIndex === -1) startIndex = i
    endIndex = i
  }

  if (startIndex === -1) return null
  return { startIndex, endIndex }
}
