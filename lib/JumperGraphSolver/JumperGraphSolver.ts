import type { GraphicsObject } from "graphics-debug"
import { HyperGraphSolver } from "../HyperGraphSolver"
import type {
  Connection,
  HyperGraph,
  RegionPortAssignment,
  SerializedConnection,
  SerializedHyperGraph,
  SolvedRoute,
} from "../types"
import type { JPort, JRegion } from "./jumper-types"
import { visualizeJumperGraphSolver } from "./visualizeJumperGraphSolver"
import { distance } from "@tscircuit/math-utils"
import { computeCrossingAssignments } from "./computeCrossingAssignments"

export class JumperGraphSolver extends HyperGraphSolver<JRegion, JPort> {
  UNIT_OF_COST = "distance"
  private enableFallback = true
  private maxCrossingsBeforeRip = 1

  constructor(input: {
    inputGraph: HyperGraph | SerializedHyperGraph
    inputConnections: (Connection | SerializedConnection)[]
    tuning?: {
      greedyMultiplier?: number
      ripCost?: number
      connectionOrder?: "asc" | "desc"
    }
    enableFallback?: boolean
  }) {
    const tuning = input.tuning ?? {}
    super({
      ...input,
      greedyMultiplier: tuning.greedyMultiplier ?? 1.1,
      rippingEnabled: true,
      ripCost: tuning.ripCost ?? 60,
    })
    this.enableFallback = input.enableFallback ?? true
    this.MAX_ITERATIONS = 8000 + input.inputConnections.length * 900
    const connectionOrder = tuning.connectionOrder ?? "desc"
    this.unprocessedConnections.sort((a, b) => {
      const distanceA = distance(a.startRegion.d.center, a.endRegion.d.center)
      const distanceB = distance(b.startRegion.d.center, b.endRegion.d.center)
      return connectionOrder === "desc"
        ? distanceB - distanceA
        : distanceA - distanceB
    })
  }

  override estimateCostToEnd(port: JPort): number {
    return distance(port.d, this.currentEndRegion!.d.center)
  }
  override getPortUsagePenalty(port: JPort): number {
    return (port.ripCount ?? 0) * 2
  }
  override computeIncreasedRegionCostIfPortsAreUsed(
    region: JRegion,
    port1: JPort,
    port2: JPort,
  ): number {
    const crossingAssignments = computeCrossingAssignments(region, port1, port2)
    const differentNetCrossings = crossingAssignments.filter(
      (assignment) =>
        assignment.connection.mutuallyConnectedNetworkId !==
        this.currentConnection!.mutuallyConnectedNetworkId,
    ).length
    return differentNetCrossings * 12
  }

  override getRipsRequiredForPortUsage(
    region: JRegion,
    port1: JPort,
    port2: JPort,
  ): RegionPortAssignment[] {
    const crossingAssignments = computeCrossingAssignments(region, port1, port2)
    // Filter out same-network crossings since those don't require ripping
    const differentNetCrossings = crossingAssignments.filter(
      (a) =>
        a.connection.mutuallyConnectedNetworkId !==
        this.currentConnection!.mutuallyConnectedNetworkId,
    )
    if (differentNetCrossings.length <= this.maxCrossingsBeforeRip) {
      return []
    }
    return differentNetCrossings
  }

  override routeSolvedHook(solvedRoute: SolvedRoute) {}

  override solve() {
    super.solve()
    if (!this.enableFallback || this.solved) {
      return
    }

    const fallbackTunings: Array<{
      greedyMultiplier: number
      ripCost: number
      connectionOrder: "asc" | "desc"
    }> = [
      { greedyMultiplier: 1.0, ripCost: 40, connectionOrder: "asc" },
      { greedyMultiplier: 1.25, ripCost: 80, connectionOrder: "desc" },
    ]

    for (const tuning of fallbackTunings) {
      const attempt = new JumperGraphSolver({
        inputGraph: this.input.inputGraph,
        inputConnections: this.input.inputConnections,
        tuning,
        enableFallback: false,
      })
      attempt.solve()
      if (attempt.solved) {
        Object.assign(this, {
          graph: attempt.graph,
          connections: attempt.connections,
          candidateQueue: attempt.candidateQueue,
          unprocessedConnections: attempt.unprocessedConnections,
          solvedRoutes: attempt.solvedRoutes,
          currentConnection: attempt.currentConnection,
          currentEndRegion: attempt.currentEndRegion,
          greedyMultiplier: attempt.greedyMultiplier,
          rippingEnabled: attempt.rippingEnabled,
          ripCost: attempt.ripCost,
          lastCandidate: attempt.lastCandidate,
          visitedPointsForCurrentConnection:
            attempt.visitedPointsForCurrentConnection,
          solved: attempt.solved,
          failed: attempt.failed,
          iterations: attempt.iterations,
          error: attempt.error,
          progress: attempt.progress,
          timeToSolve: attempt.timeToSolve,
          stats: attempt.stats,
        })
        return
      }
    }
  }

  override visualize(): GraphicsObject {
    return visualizeJumperGraphSolver(this)
  }
}
