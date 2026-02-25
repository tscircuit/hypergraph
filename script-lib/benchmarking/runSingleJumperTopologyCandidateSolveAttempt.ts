import { JumperGraphSolver } from "../../lib/JumperGraphSolver/JumperGraphSolver"
import type { XYConnection } from "../../lib/JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import { createGraphWithConnectionsFromBaseGraph } from "../../lib/JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import type { JumperTopologyCandidate } from "./jumperSolverBenchmarkTypes"

type RunSingleJumperTopologyCandidateSolveAttemptOptions = {
  candidate: JumperTopologyCandidate
  xyConnections: XYConnection[]
}

type SingleJumperTopologyCandidateSolveAttemptResult = {
  solved: boolean
  iterations: number | null
  durationMs: number | null
  error?: string
}

export const runSingleJumperTopologyCandidateSolveAttempt = ({
  candidate,
  xyConnections,
}: RunSingleJumperTopologyCandidateSolveAttemptOptions): SingleJumperTopologyCandidateSolveAttemptResult => {
  try {
    const graphWithConnections = createGraphWithConnectionsFromBaseGraph(
      candidate.graph,
      xyConnections,
    )

    const solver = new JumperGraphSolver({
      inputGraph: {
        regions: graphWithConnections.regions,
        ports: graphWithConnections.ports,
      },
      inputConnections: graphWithConnections.connections,
    })

    const start = performance.now()
    solver.solve()
    const duration = performance.now() - start

    if (!solver.solved) {
      return {
        solved: false,
        iterations: null,
        durationMs: null,
      }
    }

    return {
      solved: true,
      iterations: solver.iterations,
      durationMs: duration,
    }
  } catch (error) {
    return {
      solved: false,
      iterations: null,
      durationMs: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
