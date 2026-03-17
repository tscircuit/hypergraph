import type { SerializedHyperGraph } from "./types"

export const reattachSectionToGraph = (input: {
  fullGraph: SerializedHyperGraph
  solvedSectionGraph: SerializedHyperGraph
}): SerializedHyperGraph => {
  const { fullGraph, solvedSectionGraph } = input

  if (!fullGraph.solvedRoutes) {
    throw new Error("reattachSectionToGraph requires fullGraph.solvedRoutes")
  }
  if (!solvedSectionGraph.solvedRoutes) {
    throw new Error(
      "reattachSectionToGraph requires solvedSectionGraph.solvedRoutes",
    )
  }
  if (!solvedSectionGraph._sectionRouteBindings) {
    throw new Error(
      "reattachSectionToGraph requires solvedSectionGraph._sectionRouteBindings",
    )
  }

  const bindingByConnectionId = new Map(
    solvedSectionGraph._sectionRouteBindings.map((binding) => [
      binding.connectionId,
      binding,
    ]),
  )
  const replacementByConnectionId = new Map(
    solvedSectionGraph.solvedRoutes.map((route) => [
      route.connection.connectionId,
      route,
    ]),
  )

  return {
    ...fullGraph,
    solvedRoutes: fullGraph.solvedRoutes.map((fullSolvedRoute) => {
      const binding = bindingByConnectionId.get(
        fullSolvedRoute.connection.connectionId,
      )
      if (!binding) return fullSolvedRoute

      const replacementSolvedRoute = replacementByConnectionId.get(
        fullSolvedRoute.connection.connectionId,
      )
      if (!replacementSolvedRoute) return fullSolvedRoute

      const replacementInteriorPath = replacementSolvedRoute.path.slice(1, -1)
      const replacementPath =
        binding.solvedPathStartIndex === binding.solvedPathEndIndex
          ? [fullSolvedRoute.path[binding.solvedPathStartIndex]!]
          : [
              fullSolvedRoute.path[binding.solvedPathStartIndex]!,
              ...replacementInteriorPath.map((candidate) => ({
                ...candidate,
              })),
              fullSolvedRoute.path[binding.solvedPathEndIndex]!,
            ]

      return {
        connection: fullSolvedRoute.connection,
        requiredRip:
          fullSolvedRoute.requiredRip || replacementSolvedRoute.requiredRip,
        path: normalizeSerializedPath(
          [
            ...fullSolvedRoute.path.slice(0, binding.solvedPathStartIndex),
            ...replacementPath.map((candidate) => ({
              ...candidate,
            })),
            ...fullSolvedRoute.path.slice(binding.solvedPathEndIndex + 1),
          ],
          fullGraph,
        ),
      }
    }),
  }
}

const normalizeSerializedPath = (
  path: NonNullable<SerializedHyperGraph["solvedRoutes"]>[number]["path"],
  graph: SerializedHyperGraph,
) => {
  const portMap = new Map(graph.ports.map((port) => [port.portId, port]))

  return path.map((candidate, index) => {
    const previousCandidate = index > 0 ? path[index - 1] : undefined
    const nextCandidate = index < path.length - 1 ? path[index + 1] : undefined

    return {
      ...candidate,
      hops: index,
      lastPortId: previousCandidate?.portId,
      lastRegionId: previousCandidate
        ? getSharedRegionId(portMap, previousCandidate.portId, candidate.portId)
        : undefined,
      nextRegionId: nextCandidate
        ? getSharedRegionId(portMap, candidate.portId, nextCandidate.portId)
        : undefined,
    }
  })
}

const getSharedRegionId = (
  portMap: Map<string, SerializedHyperGraph["ports"][number]>,
  firstPortId: string,
  secondPortId: string,
): string | undefined => {
  const firstPort = portMap.get(firstPortId)
  const secondPort = portMap.get(secondPortId)
  if (!firstPort || !secondPort) return undefined

  const firstRegionIds = [firstPort.region1Id, firstPort.region2Id]
  return firstRegionIds.find(
    (regionId) =>
      regionId === secondPort.region1Id || regionId === secondPort.region2Id,
  )
}
