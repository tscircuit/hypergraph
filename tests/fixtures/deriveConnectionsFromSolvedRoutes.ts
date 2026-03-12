import type { SerializedConnection, SerializedHyperGraph } from "lib/index"
/**
 * Derives connection data from solved routes in the graph, allowing the HyperGraphSolver to visualize and utilize these connections as if they were part of the original input. This is particularly useful for test fixtures where the input graph includes solved routes but not explicit connections, enabling accurate rendering and verification of the solver's behavior with respect to these routes.
 */
export const deriveConnectionsFromSolvedRoutes = (
  graph: SerializedHyperGraph,
): SerializedConnection[] => {
  const portMap = new Map(graph.ports.map((port) => [port.portId, port]))

  return (graph.solvedRoutes ?? []).map((solvedRoute) => {
    const pathPorts = solvedRoute.pathPortIds.map(
      (portId) => portMap.get(portId)!,
    )
    const firstPort = pathPorts[0]
    const secondPort = pathPorts[1]

    let currentRegionId =
      secondPort &&
      (secondPort.region1Id === firstPort.region1Id ||
        secondPort.region2Id === firstPort.region1Id)
        ? firstPort.region2Id
        : firstPort.region1Id

    for (const port of pathPorts) {
      currentRegionId =
        port.region1Id === currentRegionId ? port.region2Id : port.region1Id
    }

    return {
      connectionId: solvedRoute.connectionId,
      startRegionId:
        currentRegionId === firstPort.region1Id
          ? firstPort.region2Id
          : firstPort.region1Id,
      endRegionId: currentRegionId,
    }
  })
}
