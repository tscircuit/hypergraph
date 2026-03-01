import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import viaTile3Net from "assets/ViaGraphSolver/via-tile-3-regions.json"
import type { XYConnection } from "lib/JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import { ViaGraphSolver } from "lib/ViaGraphSolver/ViaGraphSolver"
import { createConvexViaGraphFromXYConnections } from "lib/ViaGraphSolver/via-graph-generator/createConvexViaGraphFromXYConnections"
import { useMemo, useState } from "react"
import dataset from "../../datasets/jumper-graph-solver/dataset02.json"

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

const typedDataset = dataset as DatasetSample[]

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

export default () => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [key, setKey] = useState(0)

  const entry = typedDataset[selectedIndex]

  const problem = useMemo(() => {
    if (!entry) return null

    const xyConnections = extractXYConnections(entry)
    // tileWidth and tileHeight are now read from the viaTile JSON file
    const result = createConvexViaGraphFromXYConnections(
      xyConnections,
      viaTile3Net,
    )

    return {
      graph: result,
      connections: result.connections,
      tileCount: result.tileCount,
      viaTile: result.viaTile,
    }
  }, [selectedIndex])

  if (!entry || !problem) {
    return (
      <div style={{ padding: 20, fontFamily: "monospace" }}>
        No dataset loaded. Ensure dataset02.json exists at:
        <pre>datasets/jumper-graph-solver/dataset02.json</pre>
      </div>
    )
  }

  const { config } = entry
  const { tileCount } = problem

  // Count region types
  const convexRegions = problem.graph.regions.filter(
    (r) => r.regionId.includes(":convex:") || r.regionId.startsWith("filler:"),
  )
  const viaRegions = problem.graph.regions.filter((r) => r.d.isViaRegion)

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div
        style={{
          padding: "10px 20px",
          borderBottom: "1px solid #ccc",
          background: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <label>
            Sample:{" "}
            <input
              type="number"
              min={0}
              max={typedDataset.length - 1}
              value={selectedIndex}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!isNaN(val) && val >= 0 && val < typedDataset.length) {
                  setSelectedIndex(val)
                  setKey((k) => k + 1)
                }
              }}
              style={{ width: 60, marginRight: 5 }}
            />
            / {typedDataset.length - 1}
          </label>
          <button
            onClick={() => {
              setSelectedIndex(Math.max(0, selectedIndex - 1))
              setKey((k) => k + 1)
            }}
            disabled={selectedIndex === 0}
          >
            Prev
          </button>
          <button
            onClick={() => {
              setSelectedIndex(
                Math.min(typedDataset.length - 1, selectedIndex + 1),
              )
              setKey((k) => k + 1)
            }}
            disabled={selectedIndex === typedDataset.length - 1}
          >
            Next
          </button>
          <button
            onClick={() => {
              setSelectedIndex(Math.floor(Math.random() * typedDataset.length))
              setKey((k) => k + 1)
            }}
          >
            Random
          </button>
        </div>
        <div style={{ marginTop: 8 }}>
          <span>
            <strong>Config:</strong> {config.rows}x{config.cols}{" "}
            {config.orientation}, {config.numCrossings} crossings, seed=
            {config.seed}
          </span>
          <span style={{ marginLeft: 20 }}>
            <strong>Tiles:</strong> {tileCount.cols}x{tileCount.rows}
          </span>
          <span style={{ marginLeft: 20 }}>
            <strong>Convex regions:</strong> {convexRegions.length}
          </span>
          <span style={{ marginLeft: 20 }}>
            <strong>Via regions:</strong> {viaRegions.length}
          </span>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <GenericSolverDebugger
          key={key}
          createSolver={() =>
            new ViaGraphSolver({
              inputGraph: {
                regions: problem.graph.regions,
                ports: problem.graph.ports,
              },
              inputConnections: problem.connections,
              viaTile: problem.viaTile,
            })
          }
        />
      </div>
    </div>
  )
}
