import { useState } from "react"
import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { generateJumperX4Grid } from "lib/JumperGraphSolver/jumper-graph-generator/generateJumperX4Grid"
import { createProblemFromBaseGraph } from "lib/JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"

export default () => {
  const [cols, setCols] = useState(1)
  const [rows, setRows] = useState(1)
  const [numCrossings, setNumConnections] = useState(2)
  const [randomSeed, setRandomSeed] = useState(42)

  const baseGraph = generateJumperX4Grid({
    cols,
    rows,
    marginX: 0.5,
    marginY: 0.5,
    outerPaddingX: 0.8,
    outerPaddingY: 0.8,
    regionsBetweenPads: true,
  })

  const graphWithConnections = createProblemFromBaseGraph({
    baseGraph,
    numCrossings: numCrossings,
    randomSeed,
  })

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <label>
          Cols:{" "}
          <input
            type="number"
            min={1}
            value={cols}
            onChange={(e) => setCols(Number(e.target.value))}
            style={{ width: 60 }}
          />
        </label>{" "}
        <label>
          Rows:{" "}
          <input
            type="number"
            min={1}
            value={rows}
            onChange={(e) => setRows(Number(e.target.value))}
            style={{ width: 60 }}
          />
        </label>{" "}
        <label>
          Crossings:{" "}
          <input
            type="number"
            min={1}
            max={26}
            value={numCrossings}
            onChange={(e) => setNumConnections(Number(e.target.value))}
            style={{ width: 60 }}
          />
        </label>{" "}
        <label>
          Seed:{" "}
          <input
            type="number"
            value={randomSeed}
            onChange={(e) => setRandomSeed(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>
      </div>
      <GenericSolverDebugger
        key={`${cols}-${rows}-${numCrossings}-${randomSeed}`}
        createSolver={() =>
          new JumperGraphSolver({
            inputGraph: {
              regions: graphWithConnections.regions,
              ports: graphWithConnections.ports,
            },
            inputConnections: graphWithConnections.connections,
          })
        }
      />
    </div>
  )
}
