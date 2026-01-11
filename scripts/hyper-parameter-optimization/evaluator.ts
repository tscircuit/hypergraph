import { JumperGraphSolver } from "../../lib/JumperGraphSolver/JumperGraphSolver"
import type { Parameters, EvaluationResult, SampleConfig } from "./types"
import type { PregeneratedProblem } from "./problem-generator"

/**
 * Evaluates parameters on pregenerated problems.
 * Uses structuredClone to avoid mutating the original problem data.
 */
export function evaluateParametersOnProblems(
  params: Parameters,
  problemsByConfig: Map<number, PregeneratedProblem[]>,
  configs: SampleConfig[],
  progressLabel?: string,
): EvaluationResult {
  let totalRouted = 0
  let totalConnections = 0
  let solvedCount = 0

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i]
    if (progressLabel) {
      process.stdout.write(`\r${progressLabel}: ${i + 1}/${configs.length}`)
    }

    const problems = problemsByConfig.get(config.seed)
    if (!problems) {
      throw new Error(`No pregenerated problems for seed ${config.seed}`)
    }

    let bestRoutedFraction = 0
    let solved = false

    for (const { problem } of problems) {
      // Use structuredClone to avoid mutating the original problem
      const clonedProblem = structuredClone(problem)
      const totalConns = clonedProblem.connections.length

      const solver = new JumperGraphSolver({
        inputGraph: {
          regions: clonedProblem.regions,
          ports: clonedProblem.ports,
        },
        inputConnections: clonedProblem.connections,
        portUsagePenalty: params.portUsagePenalty,
        crossingPenalty: params.crossingPenalty,
        ripCost: params.ripCost,
      })

      // Apply additional parameters that aren't in constructor
      ;(solver as any).greedyMultiplier = params.greedyMultiplier

      solver.solve()

      const routedFraction = solver.solvedRoutes.length / totalConns

      if (solver.solved) {
        solved = true
        bestRoutedFraction = 1.0
        break
      } else if (routedFraction > bestRoutedFraction) {
        bestRoutedFraction = routedFraction
      }
    }

    // Estimate total connections from numCrossings
    const estimatedConns = Math.ceil(
      (1 + Math.sqrt(1 + 8 * config.numCrossings)) / 2,
    )
    totalConnections += estimatedConns
    totalRouted += bestRoutedFraction * estimatedConns

    if (solved) {
      solvedCount++
    }
  }

  if (progressLabel) {
    process.stdout.write("\r" + " ".repeat(50) + "\r")
  }

  return {
    continuousScore: totalRouted / totalConnections,
    successRate: solvedCount / configs.length,
    totalRouted,
    totalConnections,
  }
}
