import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import type { JPort, JRegion } from "lib/index"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"
import {
  createGraphWithConnectionsFromBaseGraph,
  type XYConnection,
} from "lib/JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import { useEffect, useMemo, useState } from "react"
import dataset from "../datasets/jumper-graph-solver/dataset02.json"
import { extractProblemBoundsFromDatasetSample } from "../script-lib/benchmarking/extractProblemBoundsFromDatasetSample"
import { extractXYConnectionsFromDatasetSample } from "../script-lib/benchmarking/extractXYConnectionsFromDatasetSample"
import { generate0603FilledAndStaggeredTopologyCandidates } from "../script-lib/benchmarking/generate0603FilledAndStaggeredTopologyCandidates"
import type {
  JumperSolverDatasetSample,
  JumperTopologyCandidate,
} from "../script-lib/benchmarking/jumperSolverBenchmarkTypes"
import { runSingleJumperTopologyCandidateSolveAttempt } from "../script-lib/benchmarking/runSingleJumperTopologyCandidateSolveAttempt"

type LastRun = {
  solved: boolean
  candidateName: string | null
  iterations: number | null
  durationMs: number | null
  error?: string
  triedCount: number
}

const typedDataset = dataset as JumperSolverDatasetSample[]

export default () => {
  const [selectedSampleIndex, setSelectedSampleIndex] = useState(0)
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0)
  const [quickMode, setQuickMode] = useState(true)
  const [debuggerKey, setDebuggerKey] = useState(0)
  const [lastRun, setLastRun] = useState<LastRun | null>(null)

  const selectedSample = typedDataset[selectedSampleIndex]

  const xyConnections = useMemo<XYConnection[]>(() => {
    if (!selectedSample) return []
    return extractXYConnectionsFromDatasetSample(selectedSample)
  }, [selectedSample])

  const candidates = useMemo<JumperTopologyCandidate[]>(() => {
    if (!selectedSample) return []
    const bounds = extractProblemBoundsFromDatasetSample(selectedSample)
    return generate0603FilledAndStaggeredTopologyCandidates(bounds)
  }, [selectedSample])

  useEffect(() => {
    setSelectedCandidateIndex(0)
    setLastRun(null)
  }, [selectedSampleIndex])

  useEffect(() => {
    if (selectedCandidateIndex >= candidates.length) {
      setSelectedCandidateIndex(0)
    }
  }, [candidates.length, selectedCandidateIndex])

  const selectedCandidate = candidates[selectedCandidateIndex] ?? null

  const selectedProblemState = useMemo(() => {
    if (!selectedCandidate) {
      return { problem: null, error: null as string | null }
    }

    try {
      const graphWithConnections = createGraphWithConnectionsFromBaseGraph(
        selectedCandidate.graph,
        xyConnections,
      )

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
          error instanceof Error ? error.message : "Unknown graph setup error",
      }
    }
  }, [selectedCandidate, xyConnections])

  const runSelectedCandidate = () => {
    if (!selectedCandidate) return

    const result = runSingleJumperTopologyCandidateSolveAttempt({
      candidate: selectedCandidate,
      xyConnections,
    })

    setLastRun({
      solved: result.solved,
      candidateName: selectedCandidate.name,
      iterations: result.iterations,
      durationMs: result.durationMs,
      error: result.error,
      triedCount: 1,
    })
    setDebuggerKey((k) => k + 1)
  }

  const runInBenchmarkOrder = () => {
    if (candidates.length === 0) return

    let mostRecentError: string | undefined

    for (const [candidateIndex, candidate] of candidates.entries()) {
      const result = runSingleJumperTopologyCandidateSolveAttempt({
        candidate,
        xyConnections,
      })

      if (result.error) {
        mostRecentError = result.error
      }

      if (!result.solved) {
        continue
      }

      setSelectedCandidateIndex(candidateIndex)
      setLastRun({
        solved: true,
        candidateName: candidate.name,
        iterations: result.iterations,
        durationMs: result.durationMs,
        triedCount: candidateIndex + 1,
      })
      setDebuggerKey((k) => k + 1)
      return
    }

    setLastRun({
      solved: false,
      candidateName: null,
      iterations: null,
      durationMs: null,
      error: mostRecentError,
      triedCount: candidates.length,
    })
  }

  if (!selectedSample) {
    return (
      <div style={{ padding: 20, fontFamily: "monospace" }}>
        No dataset loaded. Ensure dataset02.json exists at:
        <pre>datasets/jumper-graph-solver/dataset02.json</pre>
      </div>
    )
  }

  const { config } = selectedSample

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div
        style={{
          padding: "10px 20px",
          borderBottom: "1px solid #ccc",
          background: "#f5f5f5",
          fontFamily: "monospace",
          fontSize: 13,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <label>
            Sample:{" "}
            <input
              type="number"
              min={0}
              max={typedDataset.length - 1}
              value={selectedSampleIndex}
              onChange={(e) => {
                const value = Number.parseInt(e.target.value, 10)
                if (
                  !Number.isNaN(value) &&
                  value >= 0 &&
                  value < typedDataset.length
                ) {
                  setSelectedSampleIndex(value)
                  setDebuggerKey((k) => k + 1)
                }
              }}
              style={{ width: 68 }}
            />
            / {typedDataset.length - 1}
          </label>

          <button
            onClick={() => {
              setSelectedSampleIndex(Math.max(0, selectedSampleIndex - 1))
              setDebuggerKey((k) => k + 1)
            }}
            disabled={selectedSampleIndex === 0}
          >
            Prev
          </button>

          <button
            onClick={() => {
              setSelectedSampleIndex(
                Math.min(typedDataset.length - 1, selectedSampleIndex + 1),
              )
              setDebuggerKey((k) => k + 1)
            }}
            disabled={selectedSampleIndex === typedDataset.length - 1}
          >
            Next
          </button>

          <button
            onClick={() => {
              setSelectedSampleIndex(
                Math.floor(Math.random() * typedDataset.length),
              )
              setDebuggerKey((k) => k + 1)
            }}
          >
            Random
          </button>

          <label>
            Quick mode:{" "}
            <input
              type="checkbox"
              checked={quickMode}
              onChange={(e) => setQuickMode(e.target.checked)}
            />
          </label>

          <span>
            <strong>Dataset config:</strong> {config.rows}x{config.cols}{" "}
            {config.orientation}, crossings={config.numCrossings}, seed=
            {config.seed}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <label>
            Candidate:{" "}
            <select
              value={selectedCandidateIndex}
              onChange={(e) => {
                setSelectedCandidateIndex(
                  Number.parseInt(e.target.value, 10) || 0,
                )
                setDebuggerKey((k) => k + 1)
              }}
              style={{ minWidth: 360 }}
            >
              {candidates.map((candidate, index) => (
                <option key={candidate.name} value={index}>
                  {index + 1}. {candidate.name}
                </option>
              ))}
            </select>
          </label>

          <span>
            <strong>Candidates:</strong> {candidates.length}
          </span>

          <button onClick={runSelectedCandidate} disabled={!selectedCandidate}>
            Run selected solver
          </button>

          <button
            onClick={runInBenchmarkOrder}
            disabled={candidates.length === 0}
          >
            Run benchmark order
          </button>

          <button
            onClick={() => setDebuggerKey((k) => k + 1)}
            disabled={!selectedCandidate}
          >
            Reset debugger
          </button>
        </div>

        <div>
          {lastRun ? (
            <span>
              <strong>Last run:</strong>{" "}
              {lastRun.solved
                ? `solved with ${lastRun.candidateName} in ${lastRun.durationMs?.toFixed(1) ?? "N/A"}ms (${lastRun.iterations ?? "N/A"} iterations, tried ${lastRun.triedCount})`
                : `unsolved after ${lastRun.triedCount} candidate${lastRun.triedCount === 1 ? "" : "s"}${lastRun.error ? ` (${lastRun.error})` : ""}`}
            </span>
          ) : (
            <span>
              Pick a sample and candidate, then run a solver attempt to mirror
              scripts/benchmarking-0603/run-benchmark-topologies-dataset02.ts.
            </span>
          )}
        </div>
      </div>

      {selectedProblemState.error && (
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
          Graph setup error: {selectedProblemState.error}
        </div>
      )}

      <div style={{ flex: 1 }}>
        {selectedProblemState.problem ? (
          <GenericSolverDebugger
            key={debuggerKey}
            createSolver={() =>
              new JumperGraphSolver({
                inputGraph: {
                  regions: selectedProblemState.problem.graph
                    .regions as JRegion[],
                  ports: selectedProblemState.problem.graph
                    .ports as unknown as JPort[],
                },
                inputConnections: selectedProblemState.problem.connections,
                ...(quickMode ? { baseMaxIterations: 50_000 } : {}),
              })
            }
          />
        ) : (
          <div style={{ padding: 20, fontFamily: "monospace" }}>
            No candidate graph available for this sample.
          </div>
        )}
      </div>
    </div>
  )
}
