import type { XYConnection } from "../../lib/JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import type { JumperSolverDatasetSample } from "./jumperSolverBenchmarkTypes"

export const extractXYConnectionsFromDatasetSample = (
  sample: JumperSolverDatasetSample,
): XYConnection[] => {
  const regionMap = new Map(
    sample.connectionRegions.map((region) => [
      region.regionId,
      region.d.center,
    ]),
  )

  return sample.connections.map((connection) => {
    const start = regionMap.get(connection.startRegionId)
    const end = regionMap.get(connection.endRegionId)

    if (!start || !end) {
      throw new Error(
        `Missing region center for connection ${connection.connectionId}: ${connection.startRegionId} -> ${connection.endRegionId}`,
      )
    }

    return {
      connectionId: connection.connectionId,
      start,
      end,
    }
  })
}
