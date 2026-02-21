import { generate0603JumperHyperGraph } from "@tscircuit/jumper-topology-generator"
import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import type { JPort, JRegion } from "lib/index"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"
import { createProblemFromBaseGraph } from "lib/JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"
import type { JumperGraph } from "lib/JumperGraphSolver/jumper-types"
import { useMemo, useState } from "react"

const MIN_ROWS = 1
const MAX_ROWS = 6
const MIN_COLS = 1
const MAX_COLS = 6
const MIN_CROSSINGS = 1
const MAX_CROSSINGS = 12

export default () => {
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(2)
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">(
    "horizontal",
  )
  const [pattern, setPattern] = useState<"grid" | "staggered">("staggered")
  const [staggerAxis, setStaggerAxis] = useState<"x" | "y">("x")
  const [numCrossings, setNumCrossings] = useState(2)
  const [seed, setSeed] = useState(0)
  const [resetNonce, setResetNonce] = useState(0)

  const problemState = useMemo(() => {
    try {
      const baseGraph = generate0603JumperHyperGraph({
        rows,
        cols,
        orientation,
        pattern,
        ...(pattern === "staggered" ? { staggerAxis } : {}),
      }) as unknown as JumperGraph

      const graphWithConnections = createProblemFromBaseGraph({
        baseGraph,
        numCrossings,
        randomSeed: seed,
      })

      return {
        problem: {
          graph: graphWithConnections,
          connections: graphWithConnections.connections,
        },
        error: null as string | null,
      }
    } catch (error) {
      return {
        problem: null,
        error:
          error instanceof Error
            ? error.message
            : "Unknown problem generation error",
      }
    }
  }, [rows, cols, orientation, pattern, staggerAxis, numCrossings, seed])

  const problem = problemState.problem
  const debuggerKey = [
    rows,
    cols,
    orientation,
    pattern,
    staggerAxis,
    numCrossings,
    seed,
    resetNonce,
  ].join("|")

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div
        style={{
          padding: "10px 20px",
          borderBottom: "1px solid #ccc",
          background: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <label>
          Rows:{" "}
          <input
            type="number"
            min={MIN_ROWS}
            max={MAX_ROWS}
            value={rows}
            onChange={(e) =>
              setRows(
                Math.max(
                  MIN_ROWS,
                  Math.min(MAX_ROWS, parseInt(e.target.value || "0", 10) || 1),
                ),
              )
            }
            style={{ width: 60 }}
          />
        </label>

        <label>
          Cols:{" "}
          <input
            type="number"
            min={MIN_COLS}
            max={MAX_COLS}
            value={cols}
            onChange={(e) =>
              setCols(
                Math.max(
                  MIN_COLS,
                  Math.min(MAX_COLS, parseInt(e.target.value || "0", 10) || 1),
                ),
              )
            }
            style={{ width: 60 }}
          />
        </label>

        <label>
          Orientation:{" "}
          <select
            value={orientation}
            onChange={(e) =>
              setOrientation(e.target.value as "horizontal" | "vertical")
            }
          >
            <option value="horizontal">horizontal</option>
            <option value="vertical">vertical</option>
          </select>
        </label>

        <label>
          Pattern:{" "}
          <select
            value={pattern}
            onChange={(e) => setPattern(e.target.value as "grid" | "staggered")}
          >
            <option value="grid">grid</option>
            <option value="staggered">staggered</option>
          </select>
        </label>

        {pattern === "staggered" && (
          <label>
            Stagger Axis:{" "}
            <select
              value={staggerAxis}
              onChange={(e) => setStaggerAxis(e.target.value as "x" | "y")}
            >
              <option value="x">x</option>
              <option value="y">y</option>
            </select>
          </label>
        )}

        <label>
          Crossings:{" "}
          <input
            type="number"
            min={MIN_CROSSINGS}
            max={MAX_CROSSINGS}
            value={numCrossings}
            onChange={(e) =>
              setNumCrossings(
                Math.max(
                  MIN_CROSSINGS,
                  Math.min(
                    MAX_CROSSINGS,
                    parseInt(e.target.value || "0", 10) || MIN_CROSSINGS,
                  ),
                ),
              )
            }
            style={{ width: 70 }}
          />
        </label>

        <label>
          Seed:{" "}
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(parseInt(e.target.value || "0", 10) || 0)}
            style={{ width: 80 }}
          />
        </label>

        <button
          onClick={() => {
            setSeed(Math.floor(Math.random() * 100000))
          }}
        >
          Random Seed
        </button>

        <button onClick={() => setResetNonce((k) => k + 1)}>
          Reset Solver
        </button>

        <span style={{ marginLeft: 8 }}>
          {problem
            ? `Regions: ${problem.graph.regions.length}, Ports: ${problem.graph.ports.length}, Connections: ${problem.connections.length}`
            : "No problem generated"}
        </span>
      </div>

      {problemState.error && (
        <div
          style={{
            padding: "8px 20px",
            color: "#8a1c1c",
            background: "#ffe9e9",
            borderBottom: "1px solid #e4b9b9",
            fontFamily: "monospace",
            fontSize: 13,
          }}
        >
          Generation error: {problemState.error}
        </div>
      )}

      <div style={{ flex: 1 }}>
        {problem ? (
          <GenericSolverDebugger
            key={debuggerKey}
            createSolver={() =>
              new JumperGraphSolver({
                inputGraph: {
                  regions: problem.graph.regions as JRegion[],
                  ports: problem.graph.ports as unknown as JPort[],
                },
                inputConnections: problem.connections,
              })
            }
          />
        ) : (
          <div style={{ padding: 20, fontFamily: "monospace" }}>
            Adjust rows/cols/crossings/seed to generate a valid problem.
          </div>
        )}
      </div>
    </div>
  )
}
