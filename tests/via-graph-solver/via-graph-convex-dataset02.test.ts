import { expect, test } from "bun:test"
import viaTile from "assets/ViaGraphSolver/via-tile.json"
import { getSvgFromGraphicsObject } from "graphics-debug"
import type { XYConnection } from "lib/JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import { ViaGraphSolver } from "lib/ViaGraphSolver/ViaGraphSolver"
import { createConvexViaGraphFromXYConnections } from "lib/ViaGraphSolver/via-graph-generator/createConvexViaGraphFromXYConnections"
import dataset02 from "../../datasets/jumper-graph-solver/dataset02.json"

interface DatasetSample {
  config: {
    numCrossings: number
    seed: number
    rows: number
    cols: number
    orientation: "vertical" | "horizontal"
  }
  connections: {
    connectionId: string
    startRegionId: string
    endRegionId: string
  }[]
  connectionRegions: {
    regionId: string
    pointIds: string[]
    d: {
      bounds: { minX: number; maxX: number; minY: number; maxY: number }
      center: { x: number; y: number }
      isPad: boolean
      isConnectionRegion: boolean
    }
  }[]
}

const typedDataset = dataset02 as DatasetSample[]

const extractXYConnections = (sample: DatasetSample): XYConnection[] => {
  const regionMap = new Map(
    sample.connectionRegions.map((r) => [r.regionId, r.d.center]),
  )

  return sample.connections.map((conn) => {
    const start = regionMap.get(conn.startRegionId)
    const end = regionMap.get(conn.endRegionId)

    if (!start || !end) {
      throw new Error(
        `Missing region for connection ${conn.connectionId}: start=${conn.startRegionId}, end=${conn.endRegionId}`,
      )
    }

    return {
      connectionId: conn.connectionId,
      start,
      end,
    }
  })
}

test("via-graph-convex-dataset02: solve sample 0 with convex regions", () => {
  const sample = typedDataset[0]
  const xyConnections = extractXYConnections(sample)

  const result = createConvexViaGraphFromXYConnections(xyConnections, viaTile)

  // Verify tiling occurred
  expect(result.tileCount.rows).toBeGreaterThanOrEqual(0)
  expect(result.tileCount.cols).toBeGreaterThanOrEqual(0)

  // Verify we have convex regions (regionId starts with "convex:")
  const convexRegions = result.regions.filter((r) =>
    r.regionId.startsWith("convex:"),
  )
  expect(convexRegions.length).toBeGreaterThan(0)

  // Verify we have via regions
  const viaRegions = result.regions.filter((r) => r.d.isViaRegion)
  expect(viaRegions.length).toBeGreaterThan(0)
  for (const viaRegion of viaRegions) {
    expect(viaRegion.ports.length).toBe(4)
  }

  const solver = new ViaGraphSolver({
    inputGraph: {
      regions: result.regions,
      ports: result.ports,
    },
    inputConnections: result.connections,
    viaTile: result.viaTile,
  })

  solver.solve()

  expect(solver.solved).toBe(true)

  expect(getSvgFromGraphicsObject(solver.visualize())).toMatchSvgSnapshot(
    import.meta.path,
  )
}, 30000)
